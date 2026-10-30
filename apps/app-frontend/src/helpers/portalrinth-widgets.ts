/**
 * Data for the title-bar widgets: the weather behind the weather button
 * and the clock. The weather is fetched straight through the Tauri HTTP
 * client (so a configured proxy does not skew anything): an IP geolocator
 * places the player (with a Russian Sypex Geo among the candidates), then
 * Open-Meteo answers the current conditions and wttr.in - a Russian-made
 * service - stands in when Open-Meteo is not routed. Both are free and
 * keyless. Results are cached for half an hour, the widget is a glance, not
 * a live feed.
 */
import { fetch as nativeTauriFetch } from '@tauri-apps/plugin-http'

const WEATHER_UA =
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36 Portalrinth'

/**
 * Two roads to every weather host at once: the Tauri HTTP client (Rust,
 * direct) and the WebView's own fetch (goes through the system proxy/VPN,
 * all of these hosts allow CORS). Whichever answers OK first wins, so a
 * network that drops one road still gets the weather through the other.
 */
async function tauriFetch(url: string, init?: { signal?: AbortSignal }): Promise<Response> {
        const timeout = init?.signal ?? AbortSignal.timeout(10000)
        const viaTauri = nativeTauriFetch(url, {
                signal: timeout,
                headers: { 'User-Agent': WEATHER_UA, Accept: 'application/json' },
        }).then((response) => {
                if (!response.ok) throw new Error(`HTTP ${response.status}`)
                return response
        })
        const viaWebView = globalThis
                .fetch(url, { signal: timeout, headers: { Accept: 'application/json' } })
                .then((response) => {
                        if (!response.ok) throw new Error(`HTTP ${response.status}`)
                        return response
                })
        try {
                return await Promise.any([viaTauri, viaWebView])
        } catch (error) {
                const reasons = (error as AggregateError).errors ?? [error]
                throw new Error(String(reasons[0]))
        }
}

export interface WeatherNow {
        /** Celsius, rounded. */
        temp: number
        /** WMO weather interpretation code. */
        code: number
        /** Human wording, Russian. */
        label: string
        /** km/h. */
        wind: number
        /** Where the wind blows to, degrees. */
        windDir?: number
        /** Feels-like temperature, Celsius. */
        feels?: number
        /** Relative humidity, percent. */
        humidity?: number
        /** Surface pressure, hPa - the station's own barometer. */
        pressure?: number
        isDay: boolean
        place: string
        /** The station's spot, for the fine print. */
        lat?: number
        lon?: number
        elevation?: number
        /** Which service answered: Open-Meteo first, wttr.in as its spare. */
        source?: string
        fetchedAt: number
}

const CACHE_KEY = 'portalrinth-weather-cache'
const CACHE_TTL = 30 * 60 * 1000

/** WMO weather interpretation codes, worded for a launcher widget. */
export function weatherLabel(code: number): string {
        if (code === 0) return 'Ясно'
        if (code === 1) return 'Малооблачно'
        if (code === 2) return 'Переменная облачность'
        if (code === 3) return 'Пасмурно'
        if (code === 45 || code === 48) return 'Туман'
        if (code >= 51 && code <= 57) return 'Морось'
        if ((code >= 61 && code <= 67) || (code >= 80 && code <= 82)) return 'Дождь'
        if ((code >= 71 && code <= 77) || code === 85 || code === 86) return 'Снег'
        if (code === 96 || code === 99) return 'Гроза с градом'
        if (code === 95) return 'Гроза'
        return 'Погода'
}

async function geocodeByIp(): Promise<{ lat: number; lon: number; place: string }> {
        const attempts: {
                url: string
                pick: (data: Record<string, unknown>) => { lat: number; lon: number; place: string } | null
        }[] = [
                {
                        url: 'https://ipwho.is/',
                        pick: (data) =>
                                data && data.success !== false && typeof data.latitude === 'number'
                                        ? {
                                                        lat: Number(data.latitude),
                                                        lon: Number(data.longitude),
                                                        place: [data.city, data.country]
                                                                .filter(Boolean)
                                                                .join(', '),
                                                }
                                        : null,
                },
                {
                        url: 'https://get.geojs.io/v1/ip/geo.json',
                        pick: (data) =>
                                data && data.latitude
                                        ? {
                                                        lat: Number(data.latitude),
                                                        lon: Number(data.longitude),
                                                        place: [data.city, data.country].filter(Boolean).join(', '),
                                                }
                                        : null,
                },
                {
                        url: 'https://ipapi.co/json/',
                        pick: (data) =>
                                data && typeof data.latitude === 'number'
                                        ? {
                                                        lat: Number(data.latitude),
                                                        lon: Number(data.longitude),
                                                        place: [data.city, data.country].filter(Boolean).join(', '),
                                                }
                                        : null,
                },
                {
                        // Sypex Geo is a Russian geolocator: on the networks where
                        // the western ones are slow or dropped, it still answers.
                        url: 'https://api.sypexgeo.net/json/',
                        pick: (data) =>
                                data && data.city && typeof data.city.lat === 'number'
                                        ? {
                                                        lat: Number(data.city.lat),
                                                        lon: Number(data.city.lon),
                                                        place: [data.city.name_ru, data.country?.name_ru]
                                                                .filter(Boolean)
                                                                .join(', '),
                                                }
                                        : null,
                },
                {
                        url: 'https://freeipapi.com/api/json',
                        pick: (data) =>
                                data && typeof data.latitude === 'number'
                                        ? {
                                                        lat: Number(data.latitude),
                                                        lon: Number(data.longitude),
                                                        place: [data.cityName, data.countryName].filter(Boolean).join(', '),
                                                }
                                        : null,
                },
        ]
        // All geolocators are asked at once - the first real answer wins, so
        // a silent one no longer holds the widget for seconds.
        try {
                return await Promise.any(
                        attempts.map(async (attempt) => {
                                const response = await tauriFetch(attempt.url, {
                                        signal: AbortSignal.timeout(8000),
                                })
                                const picked = attempt.pick(await response.json())
                                if (!picked || !Number.isFinite(picked.lat)) throw new Error('no place')
                                return picked
                        }),
                )
        } catch {
                /* nobody answered - the timezone below guesses */
        }
        // No geo-IP answered - the timezone still knows roughly where we are.
        const fallback = await geocodeByTimezone()
        if (fallback) return fallback
        return { lat: 55.75, lon: 37.62, place: 'Москва' }
}

/**
 * When both geo-IPs stay silent, the system timezone still knows the
 * country: its last segment (Europe/Some_City) is a decent place guess,
 * and Open-Meteo geocoding turns it into coordinates.
 */
async function geocodeByTimezone(): Promise<{ lat: number; lon: number; place: string } | null> {
        let zone = ''
        try {
                zone = Intl.DateTimeFormat().resolvedOptions().timeZone || ''
        } catch {
                return null
        }
        const city = zone.split('/').pop()?.replace(/_/g, ' ')
        if (!city) return null
        const hit = await geocodeByName(city)
        return hit ? { ...hit, place: `${hit.place} (по часовому поясу)` } : null
}

async function geocodeByName(query: string): Promise<{ lat: number; lon: number; place: string } | null> {
        try {
                const response = await tauriFetch(
                        `https://geocoding-api.open-meteo.com/v1/search?count=1&language=ru&format=json&name=${encodeURIComponent(query)}`,
                        { signal: AbortSignal.timeout(8000) },
                )
                if (!response.ok) return null
                const data = (await response.json()) as {
                        results?: { latitude: number; longitude: number; name: string; country?: string }[]
                }
                const hit = data.results?.[0]
                if (!hit) return null
                return {
                        lat: hit.latitude,
                        lon: hit.longitude,
                        place: [hit.name, hit.country].filter(Boolean).join(', '),
                }
        } catch {
                /* the next geocoder gets its turn */
        }
        // Open-Meteo geocoding stayed silent - Nominatim (OpenStreetMap) sits
        // on a different host and usually answers where it does not.
        try {
                const response = await tauriFetch(
                        `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&accept-language=ru&q=${encodeURIComponent(query)}`,
                        { signal: AbortSignal.timeout(8000) },
                )
                if (response.ok) {
                        const data = (await response.json()) as {
                                lat: string
                                lon: string
                                display_name: string
                        }[]
                        const hit = data?.[0]
                        if (hit) {
                                return {
                                        lat: Number(hit.lat),
                                        lon: Number(hit.lon),
                                        place: hit.display_name.split(',').slice(0, 2).join(','),
                                }
                        }
                }
        } catch {
                /* no geocoder answered */
        }
        return null
}

/** One city, found by name - the cloud widget adds regions with it. */
export async function searchPlace(
        query: string,
): Promise<{ lat: number; lon: number; place: string } | null> {
        return geocodeByName(query)
}

/** Open-Meteo, the first station: precise, keyless, but not everywhere
 * routed - the Russian spare below catches the networks it misses. */
async function fetchFromOpenMeteo(
        location: { lat: number; lon: number; place: string },
): Promise<WeatherNow> {
        const response = await tauriFetch(
                `https://api.open-meteo.com/v1/forecast?latitude=${location.lat}&longitude=${location.lon}&current=temperature_2m,apparent_temperature,relative_humidity_2m,surface_pressure,weather_code,wind_speed_10m,wind_direction_10m,is_day`,
                { signal: AbortSignal.timeout(10000) },
        )
        if (!response.ok) throw new Error(`Погода не ответила: HTTP ${response.status}`)
        const data = (await response.json()) as {
                current?: {
                        temperature_2m: number
                        apparent_temperature: number
                        relative_humidity_2m: number
                        surface_pressure: number
                        weather_code: number
                        wind_speed_10m: number
                        wind_direction_10m: number
                        is_day: number
                }
                elevation?: number
        }
        const current = data.current
        if (!current) throw new Error('Погода не ответила')
        return {
                temp: Math.round(current.temperature_2m),
                code: current.weather_code,
                label: weatherLabel(current.weather_code),
                wind: Math.round(current.wind_speed_10m),
                windDir: current.wind_direction_10m,
                feels: Math.round(current.apparent_temperature),
                humidity: Math.round(current.relative_humidity_2m),
                pressure: Math.round(current.surface_pressure),
                isDay: current.is_day === 1,
                place: location.place,
                lat: location.lat,
                lon: location.lon,
                elevation: data.elevation !== undefined ? Math.round(data.elevation) : undefined,
                source: 'Open-Meteo',
                fetchedAt: Date.now(),
        }
}

/** WWO codes (wttr.in speaks World Weather Online) worded the same way. */
function wwoLabel(code: number): string {
        if (code === 113) return 'Ясно'
        if (code === 116) return 'Малооблачно'
        if (code === 119) return 'Облачно'
        if (code === 122) return 'Пасмурно'
        if ([143, 248, 260].includes(code)) return 'Туман'
        if ([200, 386, 389].includes(code)) return 'Гроза'
        if ([392, 395].includes(code)) return 'Гроза со снегом'
        if ([176, 263, 266, 281, 293, 296, 299, 302, 305, 350, 353, 356, 359, 362, 365, 381, 384].includes(code))
                return 'Дождь'
        if ([179, 182, 185, 227, 230, 320, 323, 326, 329, 332, 335, 338, 368, 371, 374, 377].includes(code))
                return 'Снег'
        return 'Погода'
}

/** WWO code into the WMO one the widget icons understand. */
function wwoToWmo(code: number): number {
        const label = wwoLabel(code)
        if (code === 113) return 0
        if (code === 116) return 2
        if (code === 119 || code === 122) return 3
        if (label === 'Туман') return 45
        if (label.startsWith('Гроза')) return 95
        if (label === 'Дождь') return 61
        if (label === 'Снег') return 71
        return 3
}

/** "06:54 AM" into minutes of the day; a failed parse keeps the day on. */
function minutesOfDay(value: string): number | null {
        const match = value.trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)?$/i)
        if (!match) return null
        let hours = Number(match[1]) % 12
        if ((match[3] ?? '').toUpperCase() === 'PM') hours += 12
        return hours * 60 + Number(match[2])
}

/**
 * wttr.in - a Russian-made weather service and the spare station: on plenty
 * of Russian networks Open-Meteo is slow or dropped while wttr.in answers,
 * and the other way round elsewhere. One of the two always gets through.
 */
async function fetchFromWttr(
        lat: number,
        lon: number,
        place: string,
): Promise<WeatherNow> {
        const response = await tauriFetch(`https://wttr.in/${lat},${lon}?format=j1`, {
                signal: AbortSignal.timeout(10000),
        })
        if (!response.ok) throw new Error(`wttr.in не ответил: HTTP ${response.status}`)
        const data = (await response.json()) as {
                current_condition?: {
                        temp_C: string
                        FeelsLikeC: string
                        humidity: string
                        pressure: string
                        weatherCode: string
                        windspeedKmph: string
                        winddirDegree: string
                }[]
                weather?: { astronomy?: { sunrise: string; sunset: string }[] }[]
        }
        const current = data.current_condition?.[0]
        if (!current) throw new Error('wttr.in не ответил')
        const sky = data.weather?.[0]?.astronomy?.[0]
        const now = new Date()
        const minute = now.getHours() * 60 + now.getMinutes()
        const rise = sky ? minutesOfDay(sky.sunrise) : null
        const set = sky ? minutesOfDay(sky.sunset) : null
        const isDay = rise !== null && set !== null ? minute >= rise && minute < set : true
        const code = Number(current.weatherCode)
        return {
                temp: Math.round(Number(current.temp_C)),
                code: wwoToWmo(code),
                label: wwoLabel(code),
                wind: Math.round(Number(current.windspeedKmph)),
                windDir: Number(current.winddirDegree),
                feels: Math.round(Number(current.FeelsLikeC)),
                humidity: Math.round(Number(current.humidity)),
                pressure: Math.round(Number(current.pressure)),
                isDay,
                place,
                lat,
                lon,
                source: 'wttr.in',
                fetchedAt: Date.now(),
        }
}

// ---- Meteum (Yandex) ---------------------------------------------------------

const METEUM_KEY_STORAGE = 'portalrinth-weather-yandex-key'

/** The player's own Meteum key, if they pasted one: with it Yandex answers
 * first, without it the free stations stay on duty. */
export function meteumKey(): string {
        try {
                return (localStorage.getItem(METEUM_KEY_STORAGE) ?? '').trim()
        } catch {
                return ''
        }
}

export function setMeteumKey(key: string): void {
        try {
                localStorage.setItem(METEUM_KEY_STORAGE, key.trim())
        } catch {
                /* a full quota keeps the old key */
        }
}

/** Yandex's wording for the sky, mapped onto the widget's labels and icons. */
const METEUM_CONDITIONS: Record<string, { label: string; code: number }> = {
        clear: { label: 'Ясно', code: 0 },
        'partly-cloudy': { label: 'Малооблачно', code: 1 },
        cloudy: { label: 'Облачно', code: 2 },
        overcast: { label: 'Пасмурно', code: 3 },
        drizzle: { label: 'Морось', code: 51 },
        'light-rain': { label: 'Небольшой дождь', code: 61 },
        rain: { label: 'Дождь', code: 63 },
        'moderate-rain': { label: 'Умеренный дождь', code: 63 },
        'heavy-rain': { label: 'Сильный дождь', code: 65 },
        'continuous-heavy-rain': { label: 'Длительный дождь', code: 65 },
        showers: { label: 'Ливень', code: 81 },
        'wet-snow': { label: 'Дождь со снегом', code: 71 },
        'light-snow': { label: 'Небольшой снег', code: 71 },
        snow: { label: 'Снег', code: 73 },
        'snow-showers': { label: 'Снегопад', code: 75 },
        hail: { label: 'Град', code: 96 },
        thunderstorm: { label: 'Гроза', code: 95 },
        'thunderstorm-with-rain': { label: 'Гроза с дождём', code: 95 },
        'thunderstorm-with-hail': { label: 'Гроза с градом', code: 96 },
}

const METEUM_WIND: Record<string, number> = {
        n: 0,
        ne: 45,
        e: 90,
        se: 135,
        s: 180,
        sw: 225,
        w: 270,
        nw: 315,
}

/**
 * Meteum from Yandex - the station the player unlocks with their own key
 * (the free trial one from the Yandex console works). Goes only through the
 * Tauri HTTP client: the host sends no CORS headers, so the WebView's own
 * fetch would always lose the race.
 */
async function fetchFromMeteum(
        location: { lat: number; lon: number; place: string },
): Promise<WeatherNow> {
        const key = meteumKey()
        if (!key) throw new Error('Ключ Meteum не задан')
        const response = await nativeTauriFetch(
                `https://api.weather.yandex.ru/v2/forecast?lat=${location.lat}&lon=${location.lon}&extra=true`,
                {
                        signal: AbortSignal.timeout(10000),
                        headers: {
                                'X-Yandex-Weather-Key': key,
                                Accept: 'application/json',
                                'User-Agent': WEATHER_UA,
                        },
                },
        )
        if (!response.ok) throw new Error(`Meteum не ответила: HTTP ${response.status}`)
        const data = (await response.json()) as {
                fact?: {
                        temp?: number
                        feels_like?: number
                        humidity?: number
                        pressure_pa?: number
                        condition?: string
                        wind_speed?: number
                        wind_dir?: string
                        daytime?: string
                }
        }
        const fact = data.fact
        if (!fact || typeof fact.temp !== 'number') throw new Error('Meteum не ответила')
        const sky = METEUM_CONDITIONS[fact.condition ?? ''] ?? { label: 'Погода', code: 3 }
        return {
                temp: Math.round(fact.temp),
                code: sky.code,
                label: sky.label,
                wind: Math.round(fact.wind_speed ?? 0),
                windDir: fact.wind_dir ? METEUM_WIND[fact.wind_dir.toLowerCase()] : undefined,
                feels: fact.feels_like !== undefined ? Math.round(fact.feels_like) : undefined,
                humidity: fact.humidity,
                pressure: fact.pressure_pa,
                isDay: (fact.daytime ?? 'd') === 'd',
                place: location.place,
                lat: location.lat,
                lon: location.lon,
                source: 'Meteum (Яндекс)',
                fetchedAt: Date.now(),
        }
}

export async function fetchWeather(placeQuery?: string, force = false): Promise<WeatherNow> {
        if (!placeQuery && !force) {
                try {
                        const raw = localStorage.getItem(CACHE_KEY)
                        if (raw) {
                                const cached = JSON.parse(raw) as WeatherNow
                                if (cached?.fetchedAt && Date.now() - cached.fetchedAt < CACHE_TTL) return cached
                        }
                } catch {
                        /* a broken cache is the same as no cache */
                }
        }

        const location = placeQuery ? await geocodeByName(placeQuery) : await geocodeByIp()
        if (!location) throw new Error('Место не нашлось')
        // The player's own station first: with a key Meteum beats the free ones,
        // and if it stumbles the free pair below still catches the widget.
        if (meteumKey()) {
                try {
                        return await fetchFromMeteum(location)
                } catch {
                        /* no answer from Yandex - the free stations take over */
                }
        }
        // Both stations are asked side by side: Open-Meteo is preferred, wttr.in
        // is already on its way if Open-Meteo is not routed on this network.
        const openMeteo = fetchFromOpenMeteo(location)
        const wttr = fetchFromWttr(location.lat, location.lon, location.place)
        wttr.catch(() => {})
        let weather: WeatherNow
        try {
                weather = await openMeteo
        } catch (openMeteoError) {
                try {
                        weather = await wttr
                } catch {
                        throw openMeteoError
                }
        }
        if (!placeQuery) {
                try {
                        localStorage.setItem(CACHE_KEY, JSON.stringify(weather))
                } catch {
                        /* a full quota just means the next open refetches */
                }
        }
        return weather
}

/** Which part of the day it is, for the clock's icon. */
export type TimeOfDay = 'sunrise' | 'day' | 'sunset' | 'night'

export function timeOfDay(date: Date): TimeOfDay {
        const hour = date.getHours()
        if (hour >= 5 && hour < 9) return 'sunrise'
        if (hour >= 9 && hour < 18) return 'day'
        if (hour >= 18 && hour < 21) return 'sunset'
        return 'night'
}

/** HH:MM in the system's own timezone - the clock shows what the PC shows. */
export function systemTime(date: Date): string {
        return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

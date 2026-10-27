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
import { fetch as tauriFetch } from '@tauri-apps/plugin-http'

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
        for (const attempt of attempts) {
                try {
                        const response = await tauriFetch(attempt.url, { signal: AbortSignal.timeout(8000) })
                        if (!response.ok) continue
                        const picked = attempt.pick(await response.json())
                        if (picked) return picked
                } catch {
                        /* the next geolocator gets its turn */
                }
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
                code,
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
        let weather: WeatherNow
        try {
                weather = await fetchFromOpenMeteo(location)
        } catch (openMeteoError) {
                // The first station did not answer - the Russian one gets its turn,
                // and only when both are down does the error surface.
                try {
                        weather = await fetchFromWttr(location.lat, location.lon, location.place)
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

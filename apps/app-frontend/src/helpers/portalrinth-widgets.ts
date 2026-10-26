/**
 * Data for the title-bar widgets: the weather behind the weather button
 * and the clock. The weather is fetched straight through the Tauri HTTP
 * client (so a configured proxy does not skew anything): an IP geolocator
 * places the player, then Open-Meteo answers the current conditions -
 * both services are free and keyless. Results are cached for half an
 * hour, the widget is a glance, not a live feed.
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
        isDay: boolean
        place: string
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
        const attempts: { url: string; pick: (data: any) => { lat: number; lon: number; place: string } | null }[] = [
                {
                        url: 'https://ipwho.is/',
                        pick: (data) =>
                                data && data.success !== false && typeof data.latitude === 'number'
                                        ? {
                                                        lat: data.latitude,
                                                        lon: data.longitude,
                                                        place: [data.city, data.country].filter(Boolean).join(', '),
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
        return { lat: 55.75, lon: 37.62, place: 'Москва' }
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
                return null
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
        const response = await tauriFetch(
                `https://api.open-meteo.com/v1/forecast?latitude=${location.lat}&longitude=${location.lon}&current=temperature_2m,weather_code,wind_speed_10m,is_day`,
                { signal: AbortSignal.timeout(10000) },
        )
        if (!response.ok) throw new Error(`Погода не ответила: HTTP ${response.status}`)
        const data = (await response.json()) as {
                current?: { temperature_2m: number; weather_code: number; wind_speed_10m: number; is_day: number }
        }
        const current = data.current
        if (!current) throw new Error('Погода не ответила')
        const weather: WeatherNow = {
                temp: Math.round(current.temperature_2m),
                code: current.weather_code,
                label: weatherLabel(current.weather_code),
                wind: Math.round(current.wind_speed_10m),
                isDay: current.is_day === 1,
                place: location.place,
                fetchedAt: Date.now(),
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

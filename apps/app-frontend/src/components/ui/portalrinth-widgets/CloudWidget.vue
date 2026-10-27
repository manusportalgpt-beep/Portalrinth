<template>
		<FloatingMenu placement="bottom-end" panel-class="!p-3" @open="onOpen">
				<button
						v-tooltip="formatMessage(messages.title)"
						class="flex items-center gap-1.5 rounded-xl border-none bg-transparent px-2 py-1 text-sm font-medium text-contrast backdrop-blur transition-colors hover:bg-button-bg"
				>
						<component :is="weatherIcon" class="size-4 shrink-0 text-blue" />
						<span v-if="activeWeather" class="tabular-nums">{{ activeWeather.temp }}°</span>
						<span v-else class="size-3 animate-pulse rounded-full bg-surface-5" />
				</button>
				<template #popper>
						<div class="flex w-[16rem] flex-col gap-2 p-1">
								<div class="flex items-center justify-between">
										<span class="text-sm font-semibold text-contrast">
												{{ formatMessage(messages.title) }}
										</span>
										<IconButton
												v-tooltip="formatMessage(messages.refresh)"
												type="quiet"
												size="sm"
												:label="formatMessage(messages.refresh)"
												:disabled="loading"
												@click="() => refreshActive()"
										>
												<RefreshCwIcon class="!size-3.5" />
										</IconButton>
								</div>

								<template v-if="activeWeather">
										<div class="flex items-center gap-3">
												<component
														:is="weatherIcon"
														class="size-9 shrink-0"
														:class="activeWeather.temp < 0 ? 'text-blue' : 'text-orange'"
												/>
												<div class="flex flex-col">
														<span class="text-2xl font-bold tabular-nums text-contrast">
																{{ activeWeather.temp }}°C
														</span>
														<span class="text-xs text-secondary">{{ activeWeather.label }}</span>
												</div>
										</div>
										<p class="m-0 text-xs text-secondary">
												{{ activeRegion?.place }} · {{ formatMessage(messages.wind) }}
												{{ activeWeather.wind }} км/ч {{ windRose }} ·
												{{ activeWeather.isDay ? formatMessage(messages.day) : formatMessage(messages.night) }}
										</p>
										<div
											v-if="activeWeather.feels !== undefined"
											class="grid grid-cols-2 gap-x-2 gap-y-0.5 rounded-xl bg-surface-4 px-3 py-2 text-xs text-secondary"
										>
											<span>Ощущается: <b class="font-semibold text-contrast">{{ activeWeather.feels }}°C</b></span>
											<span>Влажность: <b class="font-semibold text-contrast">{{ activeWeather.humidity }}%</b></span>
											<span>Давление: <b class="font-semibold text-contrast">{{ activeWeather.pressure }} гПа</b></span>
											<span>Ветер: <b class="font-semibold text-contrast">{{ windRoseName }}</b></span>
										</div>
										<p class="m-0 text-[11px] text-secondary">
											Метеостанция Open-Meteo · {{ activeWeather.lat?.toFixed(2) }}, {{ activeWeather.lon?.toFixed(2) }}
											<template v-if="activeWeather.elevation !== undefined"> · {{ activeWeather.elevation }} м</template>
										</p>
								</template>
								<p v-else-if="failed" class="m-0 text-sm text-red">
										{{ formatMessage(messages.fail) }}
								</p>
								<p v-else class="m-0 text-sm text-secondary">
										{{ formatMessage(messages.loading) }}
								</p>

								<!-- Регионы: клик переключает, крестик убирает. Авто-место не убирается. -->
								<div v-if="regions.length > 1" class="flex flex-col gap-1">
										<div
												v-for="region in regions"
												:key="region.id"
												class="flex items-center gap-1"
										>
												<button
														class="flex grow items-center gap-1.5 rounded-lg border-none px-2 py-1 text-left text-xs transition-colors"
														:class="
																region.id === activeId
																		? 'bg-button-bg font-semibold text-contrast'
																		: 'bg-transparent text-secondary hover:bg-button-bg'
														"
														@click="() => activate(region.id)"
												>
														<MapPinIcon class="size-3 shrink-0" />
														<span class="grow truncate">
																{{ region.auto ? formatMessage(messages.myPlace) : region.place }}
														</span>
														<span
																v-if="weatherByRegion[region.id]"
																class="tabular-nums"
														>
																{{ weatherByRegion[region.id].temp }}°
														</span>
												</button>
												<button
														v-if="!region.auto"
														v-tooltip="formatMessage(messages.remove)"
														class="flex rounded-lg border-none bg-transparent p-1 text-secondary hover:text-red"
														@click.stop="() => removeRegion(region.id)"
												>
														<XIcon class="size-3" />
												</button>
										</div>
								</div>

								<!-- Новый город: без ключей, через Open-Meteo geocoding -->
								<div class="flex gap-1.5">
										<Input
												v-model="newCity"
												size="small"
												autocomplete="off"
												:placeholder="formatMessage(messages.placeholder)"
												@keydown.enter.prevent="addRegion"
										/>
										<Button size="sm" :disabled="adding || !newCity.trim()" @click="addRegion">
												<PlusIcon class="!size-3.5" />
										</Button>
								</div>
								<p v-if="addNote" class="m-0 text-xs" :class="addFailed ? 'text-red' : 'text-secondary'">
										{{ addNote }}
								</p>
						</div>
				</template>
		</FloatingMenu>
</template>

<script setup lang="ts">
/**
 * The cloud in the title bar: one click shows the player's region and its
 * weather, and any number of cities can live beside it - a click flips
 * between them. Data stays keyless: the player is placed by IP (with a
 * manual city as the spare), conditions come from Open-Meteo. Everything
 * is cached for ten minutes per region, so flipping is instant.
 */
import {
		CloudDrizzleIcon,
		CloudFogIcon,
		CloudIcon,
		CloudLightningIcon,
		CloudRainIcon,
		CloudSnowIcon,
		MapPinIcon,
		MoonIcon,
		PlusIcon,
		RefreshCwIcon,
		SunIcon,
		XIcon,
} from '@modrinth/assets'
import { Button, defineMessages, FloatingMenu, IconButton, Input, useVIntl } from '@modrinth/ui'
import { computed, ref } from 'vue'

import { fetchWeather, searchPlace, type WeatherNow } from '@/helpers/portalrinth-widgets'

const { formatMessage } = useVIntl()

const messages = defineMessages({
		title: { id: 'app.weather.title', defaultMessage: 'Погода' },
		wind: { id: 'app.weather.wind', defaultMessage: 'ветер' },
		day: { id: 'app.weather.day', defaultMessage: 'день' },
		night: { id: 'app.weather.night', defaultMessage: 'ночь' },
		loading: { id: 'app.weather.loading', defaultMessage: 'Смотрю в окно…' },
		fail: { id: 'app.weather.fail', defaultMessage: 'Погода не отвечает' },
		refresh: { id: 'app.weather.refresh', defaultMessage: 'Обновить' },
		myPlace: { id: 'app.cloud.my-place', defaultMessage: 'Моё место' },
		placeholder: { id: 'app.cloud.placeholder', defaultMessage: 'Добавить город…' },
		remove: { id: 'app.cloud.remove', defaultMessage: 'Убрать город' },
		added: { id: 'app.cloud.added', defaultMessage: 'Город добавлен' },
		notFound: { id: 'app.cloud.not-found', defaultMessage: 'Город не нашёлся' },
})

interface WeatherRegion {
		id: string
		/** City for Open-Meteo geocoding; empty for the IP-placed home region. */
		query: string
		place: string
		auto?: boolean
}

const REGIONS_KEY = 'portalrinth-weather-regions'
const ACTIVE_KEY = 'portalrinth-weather-active'
const CACHE_KEY = 'portalrinth-weather-region-cache'
const CACHE_TTL = 10 * 60 * 1000

function readJson<T>(key: string, fallback: T): T {
		try {
				const raw = localStorage.getItem(key)
				return raw ? (JSON.parse(raw) as T) : fallback
		} catch {
				return fallback
		}
}

const homeRegion: WeatherRegion = { id: 'auto', query: '', place: '', auto: true }

const regions = ref<WeatherRegion[]>([homeRegion, ...readJson<WeatherRegion[]>(REGIONS_KEY, [])])
const activeId = ref<string>(readJson<string>(ACTIVE_KEY, 'auto'))
const weatherByRegion = ref<Record<string, WeatherNow>>(readJson(CACHE_KEY, {}))
const loading = ref(false)
const failed = ref(false)

const newCity = ref('')
const adding = ref(false)
const addNote = ref('')
const addFailed = ref(false)

function persist() {
		try {
				localStorage.setItem(
						REGIONS_KEY,
						JSON.stringify(regions.value.filter((region) => !region.auto)),
				)
				localStorage.setItem(ACTIVE_KEY, JSON.stringify(activeId.value))
				localStorage.setItem(CACHE_KEY, JSON.stringify(weatherByRegion.value))
		} catch {
				/* a full quota just means the next open refetches */
		}
}

const activeRegion = computed(() => regions.value.find((region) => region.id === activeId.value))
const activeWeather = computed(() =>
		activeRegion.value ? weatherByRegion.value[activeRegion.value.id] : undefined,
)

const weatherIcon = computed(() => {
		const data = activeWeather.value
		if (!data) return CloudIcon
		const code = data.code
		if (code === 0 || code === 1) return data.isDay ? SunIcon : MoonIcon
		if (code === 2 || code === 3) return CloudIcon
		if (code === 45 || code === 48) return CloudFogIcon
		if ((code >= 51 && code <= 57) || (code >= 80 && code <= 82)) return CloudDrizzleIcon
		if ((code >= 61 && code <= 67) || code === 95 || code === 96 || code === 99)
				return code === 95 || code === 96 || code === 99 ? CloudLightningIcon : CloudRainIcon
		if ((code >= 71 && code <= 77) || code === 85 || code === 86) return CloudSnowIcon
		return CloudIcon
})

const WIND_ROSE = ['↑', '↗', '→', '↘', '↓', '↙', '←', '↖']
const WIND_NAMES = ['северный', 'северо-восточный', 'восточный', 'юго-восточный', 'южный', 'юго-западный', 'западный', 'северо-западный']

const windRose = computed(() => {
	const dir = activeWeather.value?.windDir
	if (dir === undefined || dir === null) return ''
	return WIND_ROSE[Math.round(dir / 45) % 8]
})

const windRoseName = computed(() => {
	const dir = activeWeather.value?.windDir
	if (dir === undefined || dir === null) return '—'
	return WIND_NAMES[Math.round(dir / 45) % 8]
})

function isFresh(weather: WeatherNow | undefined): boolean {
		return !!weather?.fetchedAt && Date.now() - weather.fetchedAt < CACHE_TTL
}

async function ensureWeather(region: WeatherRegion, force = false) {
		if (!force && isFresh(weatherByRegion.value[region.id])) return
		const weather = await fetchWeather(region.auto ? undefined : region.query, force)
		weatherByRegion.value = { ...weatherByRegion.value, [region.id]: weather }
		if (region.auto) {
				homeRegion.place = weather.place
				region.place = weather.place
		}
		persist()
}

async function loadActive(force = false) {
		if (loading.value) return
		const region = activeRegion.value
		if (!region) return
		if (!force && isFresh(weatherByRegion.value[region.id])) return
		loading.value = true
		failed.value = false
		try {
				await ensureWeather(region, force)
		} catch {
				failed.value = true
		} finally {
				loading.value = false
		}
}

async function activate(id: string) {
		activeId.value = id
		persist()
		failed.value = false
		await loadActive()
}

async function refreshActive() {
		await loadActive(true)
}

async function addRegion() {
		const query = newCity.value.trim()
		if (!query || adding.value) return
		adding.value = true
		addNote.value = ''
		addFailed.value = false
		try {
				const hit = await searchPlace(query)
				if (!hit) {
						addFailed.value = true
						addNote.value = formatMessage(messages.notFound)
						return
				}
				if (regions.value.some((region) => region.place === hit.place)) {
						addNote.value = formatMessage(messages.added)
						activeId.value =
								regions.value.find((region) => region.place === hit.place)?.id ?? activeId.value
						persist()
						return
				}
				const region: WeatherRegion = {
						id: `city-${Date.now()}`,
						query: hit.place,
						place: hit.place,
				}
				regions.value = [...regions.value, region]
				activeId.value = region.id
				persist()
				newCity.value = ''
				addNote.value = formatMessage(messages.added)
				await loadActive(true)
		} catch {
				addFailed.value = true
				addNote.value = formatMessage(messages.notFound)
		} finally {
				adding.value = false
		}
}

function removeRegion(id: string) {
		regions.value = regions.value.filter((region) => region.id !== id)
		// Destructuring instead of delete: the lint forbids dynamic deletion.
		const { [id]: removed, ...rest } = weatherByRegion.value
		void removed
		weatherByRegion.value = rest
		if (activeId.value === id) activeId.value = 'auto'
		persist()
		void loadActive()
}

function onOpen() {
		void loadActive()
		// The other regions get their turn quietly, so the list shows temps.
		for (const region of regions.value) {
				if (region.id !== activeId.value && !isFresh(weatherByRegion.value[region.id])) {
						void ensureWeather(region).catch(() => {})
				}
		}
}
</script>

/**
 * CurseForge's categories as the browse filters show them.
 *
 * CurseForge sends its categories with an English name and a coloured
 * picture. Modrinth's filters are a monochrome icon and a name in the app's
 * language, so CurseForge's are given the same: an icon from the set Modrinth's
 * categories use, and a message of their own. A category this does not know
 * keeps the name CurseForge gave it and the generic tag icon.
 */
import { getCategoryIcon, type IconComponent, TagsIcon } from '@modrinth/assets'
import { defineMessages, type MessageDescriptor } from '@modrinth/ui'

const messages = defineMessages({
	addons: { id: 'curseforge.category.addons', defaultMessage: 'Addons' },
	'applied-energistics-2': {
		id: 'curseforge.category.applied-energistics-2',
		defaultMessage: 'Applied Energistics 2',
	},
	'blood-magic': { id: 'curseforge.category.blood-magic', defaultMessage: 'Blood Magic' },
	buildcraft: { id: 'curseforge.category.buildcraft', defaultMessage: 'Buildcraft' },
	crafttweaker: { id: 'curseforge.category.crafttweaker', defaultMessage: 'CraftTweaker' },
	create: { id: 'curseforge.category.create', defaultMessage: 'Create' },
	forestry: { id: 'curseforge.category.forestry', defaultMessage: 'Forestry' },
	galacticraft: { id: 'curseforge.category.galacticraft', defaultMessage: 'Galacticraft' },
	'industrial-craft': {
		id: 'curseforge.category.industrial-craft',
		defaultMessage: 'Industrial Craft',
	},
	'integrated-dynamics': {
		id: 'curseforge.category.integrated-dynamics',
		defaultMessage: 'Integrated Dynamics',
	},
	kubejs: { id: 'curseforge.category.kubejs', defaultMessage: 'KubeJS' },
	skyblock: { id: 'curseforge.category.skyblock', defaultMessage: 'Skyblock' },
	thaumcraft: { id: 'curseforge.category.thaumcraft', defaultMessage: 'Thaumcraft' },
	'thermal-expansion': {
		id: 'curseforge.category.thermal-expansion',
		defaultMessage: 'Thermal Expansion',
	},
	'tinker-s-construct': {
		id: 'curseforge.category.tinker-s-construct',
		defaultMessage: "Tinker's Construct",
	},
	'twilight-forest': {
		id: 'curseforge.category.twilight-forest',
		defaultMessage: 'Twilight Forest',
	},
	'refined-storage': {
		id: 'curseforge.category.refined-storage',
		defaultMessage: 'Refined Storage',
	},
	'adventure-and-rpg': {
		id: 'curseforge.category.adventure-and-rpg',
		defaultMessage: 'Adventure and RPG',
	},
	'api-and-library': {
		id: 'curseforge.category.api-and-library',
		defaultMessage: 'API and Library',
	},
	'armor-tools-and-weapons': {
		id: 'curseforge.category.armor-tools-and-weapons',
		defaultMessage: 'Armor, Tools, and Weapons',
	},
	'bug-fixes': { id: 'curseforge.category.bug-fixes', defaultMessage: 'Bug Fixes' },
	cosmetic: { id: 'curseforge.category.cosmetic', defaultMessage: 'Cosmetic' },
	education: { id: 'curseforge.category.education', defaultMessage: 'Education' },
	food: { id: 'curseforge.category.food', defaultMessage: 'Food' },
	magic: { id: 'curseforge.category.magic', defaultMessage: 'Magic' },
	'map-and-information': {
		id: 'curseforge.category.map-and-information',
		defaultMessage: 'Map and Information',
	},
	mcreator: { id: 'curseforge.category.mcreator', defaultMessage: 'MCreator' },
	miscellaneous: { id: 'curseforge.category.miscellaneous', defaultMessage: 'Miscellaneous' },
	performance: { id: 'curseforge.category.performance', defaultMessage: 'Performance' },
	redstone: { id: 'curseforge.category.redstone', defaultMessage: 'Redstone' },
	'server-utility': { id: 'curseforge.category.server-utility', defaultMessage: 'Server Utility' },
	storage: { id: 'curseforge.category.storage', defaultMessage: 'Storage' },
	technology: { id: 'curseforge.category.technology', defaultMessage: 'Technology' },
	automation: { id: 'curseforge.category.automation', defaultMessage: 'Automation' },
	energy: { id: 'curseforge.category.energy', defaultMessage: 'Energy' },
	'energy-fluid-and-item-transport': {
		id: 'curseforge.category.energy-fluid-and-item-transport',
		defaultMessage: 'Energy, Fluid, and Item Transport',
	},
	farming: { id: 'curseforge.category.farming', defaultMessage: 'Farming' },
	genetics: { id: 'curseforge.category.genetics', defaultMessage: 'Genetics' },
	'player-transport': {
		id: 'curseforge.category.player-transport',
		defaultMessage: 'Player Transport',
	},
	processing: { id: 'curseforge.category.processing', defaultMessage: 'Processing' },
	'twitch-integration': {
		id: 'curseforge.category.twitch-integration',
		defaultMessage: 'Twitch Integration',
	},
	'utility-qol': { id: 'curseforge.category.utility-qol', defaultMessage: 'Utility & QoL' },
	'world-gen': { id: 'curseforge.category.world-gen', defaultMessage: 'World Gen' },
	biomes: { id: 'curseforge.category.biomes', defaultMessage: 'Biomes' },
	dimensions: { id: 'curseforge.category.dimensions', defaultMessage: 'Dimensions' },
	mobs: { id: 'curseforge.category.mobs', defaultMessage: 'Mobs' },
	'ores-and-resources': {
		id: 'curseforge.category.ores-and-resources',
		defaultMessage: 'Ores and Resources',
	},
	structures: { id: 'curseforge.category.structures', defaultMessage: 'Structures' },
	'combat-pvp': { id: 'curseforge.category.combat-pvp', defaultMessage: 'Combat / PvP' },
	exploration: { id: 'curseforge.category.exploration', defaultMessage: 'Exploration' },
	'extra-large': { id: 'curseforge.category.extra-large', defaultMessage: 'Extra Large' },
	'ftb-official-pack': {
		id: 'curseforge.category.ftb-official-pack',
		defaultMessage: 'FTB Official Pack',
	},
	hardcore: { id: 'curseforge.category.hardcore', defaultMessage: 'Hardcore' },
	horror: { id: 'curseforge.category.horror', defaultMessage: 'Horror' },
	'map-based': { id: 'curseforge.category.map-based', defaultMessage: 'Map Based' },
	'mini-game': { id: 'curseforge.category.mini-game', defaultMessage: 'Mini Game' },
	multiplayer: { id: 'curseforge.category.multiplayer', defaultMessage: 'Multiplayer' },
	quests: { id: 'curseforge.category.quests', defaultMessage: 'Quests' },
	'sci-fi': { id: 'curseforge.category.sci-fi', defaultMessage: 'Sci-Fi' },
	'small-light': { id: 'curseforge.category.small-light', defaultMessage: 'Small / Light' },
	tech: { id: 'curseforge.category.tech', defaultMessage: 'Tech' },
	'vanilla-plus': { id: 'curseforge.category.vanilla-plus', defaultMessage: 'Vanilla+' },
	expert: { id: 'curseforge.category.expert', defaultMessage: 'Expert' },
	space: { id: 'curseforge.category.space', defaultMessage: 'Space' },
	'16x': { id: 'curseforge.category.16x', defaultMessage: '16x' },
	'32x': { id: 'curseforge.category.32x', defaultMessage: '32x' },
	'64x': { id: 'curseforge.category.64x', defaultMessage: '64x' },
	'128x': { id: 'curseforge.category.128x', defaultMessage: '128x' },
	'256x': { id: 'curseforge.category.256x', defaultMessage: '256x' },
	'512x-and-higher': {
		id: 'curseforge.category.512x-and-higher',
		defaultMessage: '512x and Higher',
	},
	animated: { id: 'curseforge.category.animated', defaultMessage: 'Animated' },
	'data-packs': { id: 'curseforge.category.data-packs', defaultMessage: 'Data Packs' },
	'font-packs': { id: 'curseforge.category.font-packs', defaultMessage: 'Font Packs' },
	medieval: { id: 'curseforge.category.medieval', defaultMessage: 'Medieval' },
	'mod-support': { id: 'curseforge.category.mod-support', defaultMessage: 'Mod Support' },
	modern: { id: 'curseforge.category.modern', defaultMessage: 'Modern' },
	'photo-realistic': {
		id: 'curseforge.category.photo-realistic',
		defaultMessage: 'Photo Realistic',
	},
	steampunk: { id: 'curseforge.category.steampunk', defaultMessage: 'Steampunk' },
	traditional: { id: 'curseforge.category.traditional', defaultMessage: 'Traditional' },
	fantasy: { id: 'curseforge.category.fantasy', defaultMessage: 'Fantasy' },
	realistic: { id: 'curseforge.category.realistic', defaultMessage: 'Realistic' },
	vanilla: { id: 'curseforge.category.vanilla', defaultMessage: 'Vanilla' },
	adventure: { id: 'curseforge.category.adventure', defaultMessage: 'Adventure' },
	library: { id: 'curseforge.category.library', defaultMessage: 'Library' },
	utility: { id: 'curseforge.category.utility', defaultMessage: 'Utility' },
})

const ICONS: Record<string, string> = {
	addons: 'tweaks',
	'applied-energistics-2': 'technology',
	'blood-magic': 'magic',
	buildcraft: 'technology',
	crafttweaker: 'terminal',
	create: 'technology',
	forestry: 'foliage',
	galacticraft: 'globe',
	'industrial-craft': 'technology',
	'integrated-dynamics': 'technology',
	kubejs: 'terminal',
	skyblock: 'cloud',
	thaumcraft: 'magic',
	'thermal-expansion': 'zap',
	'tinker-s-construct': 'pickaxe',
	'twilight-forest': 'tree-pine',
	'refined-storage': 'storage',
	'adventure-and-rpg': 'adventure',
	'api-and-library': 'library',
	'armor-tools-and-weapons': 'equipment',
	'bug-fixes': 'badge-check',
	cosmetic: 'palette',
	education: 'scroll-text',
	food: 'food',
	magic: 'magic',
	'map-and-information': 'map-pinned',
	mcreator: 'blocks',
	miscellaneous: 'dices',
	performance: 'optimization',
	redstone: 'zap',
	'server-utility': 'management',
	storage: 'storage',
	technology: 'technology',
	automation: 'refresh-ccw',
	energy: 'zap',
	'energy-fluid-and-item-transport': 'transportation',
	farming: 'foliage',
	genetics: 'heart-pulse',
	'player-transport': 'transportation',
	processing: 'gauge',
	'twitch-integration': 'film',
	'utility-qol': 'utility',
	'world-gen': 'worldgen',
	biomes: 'tree-pine',
	dimensions: 'globe',
	mobs: 'mobs',
	'ores-and-resources': 'pickaxe',
	structures: 'castle',
	'combat-pvp': 'combat',
	exploration: 'compass',
	'extra-large': 'kitchen-sink',
	'ftb-official-pack': 'badge-check',
	hardcore: 'challenging',
	horror: 'skull',
	'map-based': 'map-pinned',
	'mini-game': 'minigame',
	multiplayer: 'multiplayer',
	quests: 'quests',
	'sci-fi': 'network',
	'small-light': 'lightweight',
	tech: 'technology',
	'vanilla-plus': 'vanilla-like',
	expert: 'trophy',
	space: 'globe',
	'16x': 'grid-3x3',
	'32x': 'grid-3x3',
	'64x': 'grid-3x3',
	'128x': 'grid-3x3',
	'256x': 'grid-3x3',
	'512x-and-higher': 'grid-3x3',
	animated: 'film',
	'data-packs': 'blocks',
	'font-packs': 'fonts',
	medieval: 'castle',
	'mod-support': 'modded',
	modern: 'building-2',
	'photo-realistic': 'realistic',
	steampunk: 'gauge',
	traditional: 'house',
	fantasy: 'fantasy',
	realistic: 'realistic',
	vanilla: 'vanilla-like',
	adventure: 'adventure',
	library: 'library',
	utility: 'utility',
}

function categoryKey(name: string): string {
	return name
		.toLowerCase()
		.replace(/\+/g, ' plus')
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '')
}

export function curseforgeCategoryMessage(name: string): MessageDescriptor | undefined {
	return (messages as Record<string, MessageDescriptor>)[categoryKey(name)]
}

export function curseforgeCategoryIcon(name: string): IconComponent {
	const icon = ICONS[categoryKey(name)]
	return (icon ? getCategoryIcon(icon) : undefined) ?? TagsIcon
}

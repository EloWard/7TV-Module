import { ref, reactive, toRef } from "vue";
import { useConfig } from "@/composable/useSettings";

const API_BASE_URL = "https://eloward-ranks.unleashai.workers.dev/api/ranks/lol";
const CDN_BASE_URL = "https://eloward-cdn.unleashai.workers.dev/lol";
const DEFAULT_CACHE_DURATION = 60 * 60 * 1000;
const NEGATIVE_CACHE_DURATION = 15 * 60 * 1000;
const MAX_CACHE_SIZE = 500;
const BADGE_CACHE_VERSION = "3";
const DEV_MODE = import.meta.env.DEV;

interface CacheEntry {
	data: EloWardRankData | null; // null for negative cache
	timestamp: number;
}

class LRUCache {
	private cache: Map<string, CacheEntry>;
	private maxSize: number;

	constructor(maxSize = 500) {
		this.cache = new Map();
		this.maxSize = maxSize;
	}

	get(username: string): EloWardRankData | null | undefined {
		const key = username.toLowerCase();
		const entry = this.cache.get(key);

		if (!entry) return undefined; // Not in cache

		// Check if cache is expired
		const now = Date.now();
		const cacheDuration =
			entry.data === null
				? NEGATIVE_CACHE_DURATION // Shorter duration for negative cache
				: DEFAULT_CACHE_DURATION;

		if (now - entry.timestamp > cacheDuration) {
			this.cache.delete(key);
			return undefined;
		}

		// Move to end (most recently used)
		this.cache.delete(key);
		this.cache.set(key, entry);

		return entry.data; // Can be null (negative cache) or data
	}

	set(username: string, data: EloWardRankData | null) {
		const key = username.toLowerCase();

		// Remove oldest entry if at max size
		if (this.cache.size >= this.maxSize && !this.cache.has(key)) {
			const firstKey = this.cache.keys().next().value;
			if (firstKey) this.cache.delete(firstKey);
		}

		this.cache.set(key, {
			data,
			timestamp: Date.now(),
		});
	}

	clear() {
		this.cache.clear();
	}

	size(): number {
		return this.cache.size;
	}
}

// Global cache instance
const rankCache = new LRUCache(MAX_CACHE_SIZE);
const pendingRequests = new Map<string, Promise<EloWardRankData | null>>();

const globalData = reactive({
	userBadges: {} as Record<string, EloWardBadge | null>,
});

const RANK_TIERS = new Set([
	"iron",
	"bronze",
	"silver",
	"gold",
	"platinum",
	"emerald",
	"diamond",
	"master",
	"grandmaster",
	"challenger",
	"unranked",
]);

function getImageUrl(tier: string, isAnimated: boolean): string {
	const extension = isAnimated ? ".webp" : ".png";
	const suffix = isAnimated ? "_premium" : "";
	return `${CDN_BASE_URL}/${tier}${suffix}${extension}?v=${BADGE_CACHE_VERSION}`;
}

function perfLog(message: string, data?: unknown) {
	if (DEV_MODE) {
		console.log(`[EloWard Perf] ${message}`, data || "");
	}
}

export interface EloWardRankData {
	tier: string;
	division?: string;
	leaguePoints?: number;
	summonerName?: string;
	region?: string;
	animate_badge?: boolean;
}

export interface EloWardBadge {
	id: string;
	tier: string;
	division?: string;
	imageUrl: string;
	animated: boolean;
	summonerName?: string;
	region?: string;
	leaguePoints?: number;
}

export function useEloWardRanks() {
	const enabled = useConfig<boolean>("eloward.enabled");
	const isLoading = ref(false);

	function getCachedRankData(username: string): EloWardRankData | null | undefined {
		const startTime = performance.now();
		if (!enabled.value || !username) return undefined;
		const normalizedUsername = username.toLowerCase();
		const result = rankCache.get(normalizedUsername);
		perfLog(`getCachedRankData(${username})`, {
			cached: result !== undefined,
			duration: `${(performance.now() - startTime).toFixed(2)}ms`,
		});
		return result;
	}

	function getOrFetchBadge(username: string): void {
		if (!enabled.value || !username) return;
		const normalizedUsername = username.toLowerCase();

		const cachedData = rankCache.get(normalizedUsername);
		if (cachedData !== undefined) {
			const badge = cachedData ? getRankBadge(cachedData) : null;
			globalData.userBadges[normalizedUsername] = badge;
			return;
		}

		if (pendingRequests.has(normalizedUsername)) return;

		fetchRankData(username).then((rankData) => {
			const badge = rankData ? getRankBadge(rankData) : null;
			globalData.userBadges[normalizedUsername] = badge;
		});
	}

	async function fetchRankData(username: string): Promise<EloWardRankData | null> {
		const startTime = performance.now();
		perfLog(`fetchRankData(${username}) - START`);

		if (!enabled.value || !username) {
			perfLog(`fetchRankData(${username}) - SKIPPED (disabled or no username)`);
			return null;
		}

		const normalizedUsername = username.toLowerCase();

		const cached = rankCache.get(normalizedUsername);
		if (cached !== undefined) {
			perfLog(`fetchRankData(${username}) - CACHE HIT`, {
				duration: `${(performance.now() - startTime).toFixed(2)}ms`,
			});
			return cached;
		}

		if (pendingRequests.has(normalizedUsername)) {
			perfLog(`fetchRankData(${username}) - PENDING REQUEST EXISTS`);
			return pendingRequests.get(normalizedUsername)!;
		}

		const requestPromise = (async () => {
			try {
				isLoading.value = true;
				perfLog(`fetchRankData(${username}) - FETCH START`);
				const fetchStart = performance.now();

				const response = await fetch(`${API_BASE_URL}/${normalizedUsername}`, {
					method: "GET",
					headers: {
						Accept: "application/json",
					},
					signal: AbortSignal.timeout(5000),
				});

				perfLog(`fetchRankData(${username}) - FETCH COMPLETE`, {
					status: response.status,
					duration: `${(performance.now() - fetchStart).toFixed(2)}ms`,
				});

				if (response.status === 404) {
					rankCache.set(normalizedUsername, null);
					perfLog(`fetchRankData(${username}) - NOT FOUND (404)`);
					return null;
				}

				if (!response.ok) {
					perfLog(`fetchRankData(${username}) - ERROR (${response.status})`);
					return null;
				}

				const parseStart = performance.now();
				const data = await response.json();
				perfLog(`fetchRankData(${username}) - JSON PARSE`, {
					duration: `${(performance.now() - parseStart).toFixed(2)}ms`,
				});

				if (!data.rank_tier || !RANK_TIERS.has(data.rank_tier.toLowerCase())) {
					rankCache.set(normalizedUsername, null);
					perfLog(`fetchRankData(${username}) - INVALID DATA`);
					return null;
				}

				const rankData: EloWardRankData = {
					tier: data.rank_tier,
					division: data.rank_division,
					leaguePoints: data.lp,
					summonerName: data.riot_id,
					region: data.region,
					animate_badge: data.animate_badge,
				};

				rankCache.set(normalizedUsername, rankData);
				perfLog(`fetchRankData(${username}) - SUCCESS`, {
					tier: rankData.tier,
					totalDuration: `${(performance.now() - startTime).toFixed(2)}ms`,
				});
				return rankData;
			} catch (error) {
				perfLog(`fetchRankData(${username}) - EXCEPTION`, error);
				return null;
			} finally {
				isLoading.value = false;
				pendingRequests.delete(normalizedUsername);
			}
		})();

		pendingRequests.set(normalizedUsername, requestPromise);
		return requestPromise;
	}

	function getRankBadge(rankData: EloWardRankData): EloWardBadge | null {
		const startTime = performance.now();
		if (!rankData?.tier) return null;

		const tier = rankData.tier.toLowerCase();
		if (!RANK_TIERS.has(tier)) return null;

		const shouldAnimate = Boolean(rankData.animate_badge);
		const imageUrl = getImageUrl(tier, shouldAnimate);

		const badge = {
			id: `eloward-${tier}${rankData.division ? `-${rankData.division}` : ""}`,
			tier: rankData.tier.toUpperCase(),
			division: rankData.division,
			imageUrl,
			animated: shouldAnimate,
			summonerName: rankData.summonerName,
			region: rankData.region,
			leaguePoints: rankData.leaguePoints,
		};

		perfLog(`getRankBadge(${tier})`, {
			duration: `${(performance.now() - startTime).toFixed(2)}ms`,
		});

		return badge;
	}

	/**
	 * Format rank text for display
	 */
	function formatRankText(rankData: EloWardRankData): string {
		if (!rankData?.tier) return "UNRANKED";

		const tierUpper = rankData.tier.toUpperCase();
		if (tierUpper === "UNRANKED") return "UNRANKED";

		let rankText = tierUpper;

		if (rankData.division && !["MASTER", "GRANDMASTER", "CHALLENGER"].includes(tierUpper)) {
			rankText += ` ${rankData.division}`;
		}

		if (rankData.leaguePoints !== undefined && rankData.leaguePoints !== null) {
			rankText += ` - ${rankData.leaguePoints} LP`;
		}

		return rankText;
	}

	/**
	 * Get region display name
	 */
	function getRegionDisplay(region?: string): string {
		if (!region) return "";

		const regionMap: Record<string, string> = {
			na1: "NA",
			euw1: "EUW",
			eun1: "EUNE",
			kr: "KR",
			br1: "BR",
			jp1: "JP",
			la1: "LAN",
			la2: "LAS",
			oc1: "OCE",
			tr1: "TR",
			ru: "RU",
			ph2: "PH",
			sg2: "SG",
			th2: "TH",
			tw2: "TW",
			vn2: "VN",
			me1: "ME",
			sea: "SEA",
		};

		return regionMap[region.toLowerCase()] || region.toUpperCase();
	}

	/**
	 * Build OP.GG URL for a player
	 */
	function getOpGGUrl(rankData: EloWardRankData): string | null {
		if (!rankData?.summonerName || !rankData?.region) return null;

		const regionMapping: Record<string, string> = {
			na1: "na",
			euw1: "euw",
			eun1: "eune",
			kr: "kr",
			br1: "br",
			jp1: "jp",
			la1: "lan",
			la2: "las",
			oc1: "oce",
			tr1: "tr",
			ru: "ru",
			ph2: "ph",
			sg2: "sg",
			th2: "th",
			tw2: "tw",
			vn2: "vn",
			me1: "me",
		};

		const opGGRegion = regionMapping[rankData.region.toLowerCase()];
		if (!opGGRegion) return null;

		const [summonerName, tagLine] = rankData.summonerName.split("#");
		const encodedName = encodeURIComponent(summonerName);
		const tag = tagLine || rankData.region.toUpperCase();

		return `https://op.gg/lol/summoners/${opGGRegion}/${encodedName}-${tag}`;
	}

	function clearCache() {
		perfLog("clearCache() - clearing all caches");
		rankCache.clear();
		pendingRequests.clear();
		globalData.userBadges = {};
	}

	return {
		fetchRankData,
		getCachedRankData,
		getRankBadge,
		getOrFetchBadge,
		formatRankText,
		getRegionDisplay,
		getOpGGUrl,
		clearCache,
		isLoading,
		cacheSize: () => rankCache.size(),
	};
}

export function useEloWardBadge(username: string) {
	if (!username) return ref(null);
	const normalizedUsername = username.toLowerCase();

	if (!globalData.userBadges[normalizedUsername]) {
		globalData.userBadges[normalizedUsername] = null;
	}

	return toRef(globalData.userBadges, normalizedUsername);
}

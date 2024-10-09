import { TwTypeBadge, TwTypeMessage, TwTypeUser } from "@/assets/gql/tw.gql";
import { imageHostToSrcset } from "./Image";
import { ChatMessage, ChatUser } from "./chat/ChatMessage";

const BTTV_ZeroWidth = ["SoSnowy", "IceCold", "SantaHat", "TopHat", "ReinDeer", "CandyCane", "cvMask", "cvHazmat"];

export function convertPlatformEmoteSet(data: Twitch.TwitchEmoteSet): SevenTV.EmoteSet {
	const isGlobalSet = !data.owner;

	return {
		id: "PLATFORM#" + data.id,
		name: data.owner?.displayName ?? "Global Emotes",
		immutable: true,
		privileged: true,
		tags: [],
		flags: 0,
		provider: "PLATFORM",
		scope: isGlobalSet ? "GLOBAL" : "CHANNEL",
		owner: data.owner?.displayName
			? {
					id: data.owner.id,
					username: data.owner.displayName,
					display_name: data.owner.displayName,
					avatar_url: data.owner.profileImageURL,
			  }
			: undefined,
		emotes: data.emotes.map((e) => {
			const d = convertTwitchEmote(e, data.owner);
			return {
				id: e.id,
				name: e.token,
				flags: 0,
				provider: "PLATFORM",
				data: d,
			};
		}),
	};
}

export function convertKickEmoteSet(data: Kick.KickEmoteSet): SevenTV.EmoteSet {
	const isGlobalSet = !("user" in data);

	return {
		id: "PLATFORM#" + data.id,
		name: isGlobalSet ? data.name : data.user.username,
		immutable: true,
		privileged: true,
		tags: [],
		flags: 0,
		provider: "PLATFORM",
		scope: isGlobalSet ? "GLOBAL" : "CHANNEL",
		owner: !isGlobalSet
			? {
					id: data.user_id.toString(),
					username: data.user.username,
					display_name: data.user.username,
					avatar_url: data.user.profile_pic,
			  }
			: undefined,
		emotes: data.emotes.map((e) => {
			const d = convertKickEmote(e, !isGlobalSet ? data.user : undefined);
			return {
				id: e.id.toString(),
				name: e.name,
				flags: 0,
				provider: "PLATFORM",
				data: d,
			};
		}),
	};
}

export function convertTwitchEmote(
	data: Partial<Twitch.TwitchEmote>,
	owner?: Twitch.TwitchEmoteSet["owner"],
): SevenTV.Emote {
	const emote: SevenTV.Emote = {
		id: data.id ?? "",
		name: data.token ?? "",
		flags: 0 as SevenTV.EmoteFlags,
		tags: [],
		state: [],
		lifecycle: 3,
		listed: true,
		owner: owner
			? {
					id: owner.id,
					username: owner.displayName,
					display_name: owner.displayName,
					avatar_url: owner.profileImageURL,
			  }
			: null,
		host: {
			url: "//static-cdn.jtvnw.net/emoticons/v2/" + data.id + "/default/dark",
			files: [
				{
					name: "1.0",
					format: "PNG",
				},
				{
					name: "2.0",
					format: "PNG",
				},
				{
					name: "4.0",
					format: "PNG",
				},
			],
		},
	};

	emote.host.srcset = imageHostToSrcset(emote.host, "PLATFORM");
	return emote;
}

export function convertKickEmote(data: Kick.KickEmote, owner?: Kick.KickUserEmoteSet["user"]): SevenTV.Emote {
	return {
		id: data.id?.toString(),
		name: data.name,
		flags: undefined,
		tags: [],
		state: [],
		lifecycle: 3,
		listed: true,
		owner: owner
			? {
					id: owner.id,
					username: owner.username,
					display_name: owner.username,
					avatar_url: owner.profile_pic,
			  }
			: null,
		host: {
			url: "//files.kick.com/emotes/" + data.id.toString(),
			files: [
				{
					name: "fullsize",
					format: "PNG",
				},
			],
			srcset: `https://files.kick.com/emotes/${data.id}/fullsize 2.2x`,
		},
	};
}

export function convertCheerEmote(data: Twitch.ChatMessage.EmotePart["content"]): SevenTV.Emote {
	return {
		id: data.emoteID ?? "",
		name: `${data.alt} ${data.cheerAmount}`,
		flags: 0 as SevenTV.EmoteFlags,
		tags: [],
		state: [],
		lifecycle: 3,
		listed: true,
		owner: null,
		host: {
			url: data.images?.dark["1x"].split("/").slice(0, -1).join("/").replace("https:", "") ?? "",
			files: [
				{
					name: "1.gif",
					format: "GIF",
				},
				{
					name: "2.gif",
					format: "GIF",
				},
				{
					name: "3.gif",
					format: "GIF",
				},
				{
					name: "4.gif",
					format: "GIF",
				},
			],
		},
	};
}

export function convertBttvEmoteSet(data: BTTV.UserResponse, channelID: string): SevenTV.EmoteSet {
	const channelEmotes = data.channelEmotes ?? [];
	const sharedEmotes = data.sharedEmotes ?? [];

	return {
		id: "BTTV#" + channelID,
		name: channelID == "GLOBAL" ? "Global Emotes" : "Channel Emotes",
		immutable: true,
		privileged: true,
		tags: [],
		flags: 0,
		provider: "BTTV",
		owner: {
			id: channelID,
			username: channelID,
			display_name: channelID,
			avatar_url: data.avatar ?? "",
		},
		emotes: [...channelEmotes, ...sharedEmotes].map((e) => {
			const data = convertBttvEmote(e);
			data.host.srcset = imageHostToSrcset(data.host, "BTTV");
			return {
				id: e.id,
				name: e.code,
				flags: 0,
				provider: "BTTV",
				data: data,
			};
		}),
	};
}

export function convertBttvEmote(data: BTTV.Emote): SevenTV.Emote {
	return {
		id: data.id,
		name: data.code,
		flags: (BTTV_ZeroWidth.indexOf(data.code) > -1 ? 256 : 0) as SevenTV.EmoteFlags,
		tags: [],
		state: [],
		lifecycle: 3,
		listed: true,
		owner: data.user
			? {
					id: data.user.id,
					username: data.user.name,
					display_name: data.user.displayName,
					avatar_url: "",
			  }
			: null,
		host: {
			url: "//cdn.betterttv.net/emote/" + data.id,
			files: [
				{
					name: "1x",
					format: data.imageType.toUpperCase() as SevenTV.ImageFormat,
				},
				{
					name: "2x",
					format: data.imageType.toUpperCase() as SevenTV.ImageFormat,
				},
				{
					name: "3x",
					format: data.imageType.toUpperCase() as SevenTV.ImageFormat,
				},
			],
		},
	};
}

export function convertFFZEmoteSet(data: FFZ.RoomResponse, channelID: string): SevenTV.EmoteSet {
	const sets = Object.values(data.sets);

	return {
		id: "FFZ#" + channelID,
		name: channelID == "GLOBAL" ? " Global Emotes" : "Channel Emotes",
		immutable: true,
		privileged: true,
		tags: [],
		flags: 0,
		provider: "FFZ",
		owner: {
			id: channelID,
			username: channelID,
			display_name: channelID,
			avatar_url: "",
		},
		emotes: sets.length
			? sets.reduce((con, set) => {
					return [
						...con,
						...(set.emoticons.map((e) => {
							const data = convertFFZEmote(e);
							data.host.srcset = imageHostToSrcset(data.host, "FFZ");
							return {
								id: e.id.toString(),
								name: e.name,
								flags: 0,
								provider: "FFZ",
								data: data,
							};
						}) as SevenTV.ActiveEmote[]),
					];
			  }, [] as SevenTV.ActiveEmote[])
			: [],
	};
}

export function convertFFZEmote(data: FFZ.Emote): SevenTV.Emote {
	return {
		id: data.id.toString(),
		name: data.name,
		flags: 0 as SevenTV.EmoteFlags,
		tags: [],
		state: [],
		lifecycle: 3,
		listed: true,
		owner: null,
		host: {
			url: data.animated
				? "//cdn.frankerfacez.com/emote/" + data.id + "/animated"
				: "//cdn.frankerfacez.com/emote/" + data.id,
			files: data.animated
				? Object.keys(data.animated).map((key) => {
						return {
							name: key,
							format: "WEBP",
						};
				  })
				: Object.keys(data.urls).map((key) => {
						return {
							name: key,
							format: "PNG",
						};
				  }),
		},
	};
}

export function convertFfzBadges(data: FFZ.BadgesResponse): SevenTV.Cosmetic<"BADGE">[] {
	const badges = [] as SevenTV.Cosmetic<"BADGE">[];

	for (const badge of data.badges) {
		badges.push({
			id: badge.id.toString(),
			kind: "BADGE",
			provider: "FFZ",
			data: {
				name: badge.name,
				tooltip: badge.title,
				host: {
					url: "//cdn.frankerfacez.com/badge/" + badge.id,
					files: [{ name: "1" }, { name: "2" }, { name: "4" }],
				},
				backgroundColor: badge.color,
				replace: badge.replaces,
			},
			user_ids: data.users[badge.id.toString()].map((u) => u.toString()),
		} as SevenTV.Cosmetic<"BADGE">);
	}

	return badges;
}

export function convertTwitchBadge(data: TwTypeBadge): SevenTV.Cosmetic<"BADGE"> {
	const sp = data.image1x.slice(6).split("/");
	const baseURL = sp.slice(0, sp.length - 1).join("/");

	return {
		id: data.setID + ":" + data.version,
		kind: "BADGE",
		provider: "PLATFORM",
		data: {
			name: data.title,
			host: {
				url: baseURL,
				files: [
					{ name: "1", format: "PNG" },
					{ name: "2", format: "PNG" },
					{ name: "3", format: "PNG" },
				],
			},
			tooltip: data.title,
		},
	};
}

export function convertTwitchMessage(d: TwTypeMessage): ChatMessage {
	const msg = new ChatMessage(d.id);
	msg.body = d.content?.text ?? "";
	msg.author = d.sender ? convertTwitchUser(d.sender) : null;
	msg.badges =
		d.sender && Array.isArray(d.sender.displayBadges)
			? d.sender.displayBadges.reduce(
					(con, badge) => {
						con[badge.setID] = badge.version;
						return con;
					},
					{} as Record<string, string>,
			  )
			: {};
	msg.timestamp = new Date(d.sentAt).getTime();
	msg.moderation.deleted = !!d.deletedAt;

	return msg;
}

function convertTwitchUser(d: TwTypeUser): ChatUser {
	return {
		id: d.id,
		username: d.login,
		displayName: d.displayName,
		color: d.chatColor,
	};
}

export function semanticVersionToNumber(ver: string): number {
	const parts = ver.split(".");
	let s = parts
		.slice(0, 3)
		.map((p) => parseInt(p, 10))
		.reduce((con, p, i) => {
			return con + p * Math.pow(100, 2 - i);
		}, 0)
		.toString(10);

	if (parts.length > 3) {
		s += "." + parseInt(parts[3]);
	}

	const result = parseFloat(s);

	return result;
}

export function convertExternalKickEmote(id: string, name: string): SevenTV.Emote {
	return {
		id: id,
		name: name,
		tags: [],
		state: [],
		lifecycle: 3,
		listed: true,
		owner: null,
		host: {
			url: "//files.kick.com/emotes/" + id,
			files: [
				{
					name: "fullsize",
					format: "PNG",
				},
			],
			srcset: `https://files.kick.com/emotes/${id}/fullsize 2.2x`,
		},
	};
}

import type {
    SiteConfig,
    ProfileConfig,
    LicenseConfig
} from "./types/config"

import type { FriendLink } from "./types/friend"

export const siteConfig: SiteConfig = {
    title: "",
    subTitle: "随笔与记录",

    favicon: "/favicon/favicon.ico", // Path of the favicon, relative to the /public directory

    pageSize: 6, // Number of posts per page
    toc: {
        enable: true,
        depth: 3 // Max depth of the table of contents, between 1 and 4
    },
    blogNavi: {
        enable: true // Whether to enable blog navigation in the blog footer
    },
    comments: {
        enable: true, // Whether to enable comments
        platform: "twikoo", // Comment platform, set "default" to use Momo-backend, also supports "twikoo"
        backendUrl: "https://comments.ueriy.com" // Twikoo envId / backend URL
    },
    theme: {
        AOS: true, // Whether to enable AOS (Animate On Scroll) for animations
        LQIP: true, // Whether to enable LQIP (Low-Quality Image Placeholder) for image placeholders
        PhotoSwipe: true // Whether to enable PhotoSwipe for image viewer
    }
}

export const profileConfig: ProfileConfig = {
    avatar: "assets/about-avatar.jpg", // Relative to the /src directory. Relative to the /public directory if it starts with '/'
    name: "ueriy",
    description: "写给自己，也写给偶然路过的人。",
    indexPage: "https://ueriy.com",
    startYear: 2026,
}

export const licenseConfig: LicenseConfig = {
	enable: true,
	name: "CC BY-NC-SA 4.0",
	url: "https://creativecommons.org/licenses/by-nc-sa/4.0/",
};

export const friendLinkConfig: FriendLink[] = [
    {
        name: '作品集',
        avatar: '/favicon/favicon.ico',
        url: 'https://ueriy.com',
        description: '个人作品集与博客'
    }
]

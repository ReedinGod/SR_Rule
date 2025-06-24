/*
 * Quantumult X 脚本: 移除特定域名开屏广告
 * 参考自 @yichahucha 脚本，并根据用户提供的域名进行定制。
 *
 * 功能: 拦截并修改特定域名的响应，清空或禁用开屏广告数据。
 */

// 定义需要处理的域名列表
const targetDomains = [
    "carapptest.gtmc.com.cn",
    "carappvideo.gtmc.com.cn",
    "sa.carapp.gtmc.com.cn",
    "api.ximalaya.com",
    "open.youzanyun.com",
    "cms.gtmc.com.cn",
    "gz-43e866.kaiqsz.com"
];

// 获取当前的响应体和请求 URL
let obj = {};
try {
    obj = JSON.parse($response.body);
} catch (e) {
    // 如果响应体不是有效的 JSON，则直接返回原始响应，不做处理
    $done({ body: $response.body });
    return;
}

const requestUrl = $request.url;

// 检查当前请求的 URL 是否包含在目标域名列表中
let isTargetDomain = false;
for (const domain of targetDomains) {
    if (requestUrl.includes(domain)) {
        isTargetDomain = true;
        break;
    }
}

if (isTargetDomain) {
    // --- 广告数据通用处理逻辑 ---
    // 针对常见的广告字段进行清空或修改
    if (obj.data && typeof obj.data === 'object') {
        // 尝试清空常见的广告数组
        if (Array.isArray(obj.data.ad)) {
            obj.data.ad = [];
        }
        if (Array.isArray(obj.data.ads)) {
            obj.data.ads = [];
        }
        if (Array.isArray(obj.data.advertisement)) {
            obj.data.advertisement = [];
        }
        if (Array.isArray(obj.data.banner)) {
            obj.data.banner = [];
        }
        // 对于可能包含广告的列表，尝试清空或过滤
        if (Array.isArray(obj.data.items)) {
            obj.data.items = obj.data.items.filter(item => {
                // 假设非广告项通常没有 "ad" 或 "promotion" 字段
                return !item.ad && !item.promotion && !item.is_ad;
            });
        }
        if (Array.isArray(obj.data.cardList)) {
            // 保留一些基础功能卡片，移除其他
            obj.data.cardList = obj.data.cardList.filter(card => {
                const dataType = card.dataType || '';
                return !dataType.includes("Ad") && !dataType.includes("Promotion") &&
                       !dataType.includes("Advert"); // 过滤包含广告关键字的卡片
            });
        }

        // 针对某些特定的广告时间或开关字段
        if (obj.data.background_delay_display_time) {
            obj.data.background_delay_display_time = 60 * 60 * 24 * 365 * 1000; // 推迟到一年后
        }
        if (obj.data.show_push_splash_ad !== undefined) {
            obj.data.show_push_splash_ad = false;
        }
        if (obj.data.display_time !== undefined) {
             obj.data.display_time = 0; // 设置显示时间为0
        }
        if (obj.data.start_time !== undefined) {
             obj.data.start_time = 2240150400; // 遥远未来
        }
        if (obj.data.end_time !== undefined) {
             obj.data.end_time = 2240150400; // 遥远未来
        }
    }
    
    // 如果响应体根部直接是广告数组
    if (Array.isArray(obj) && obj.length > 0) {
        obj = []; // 直接清空整个数组
    }

    // 针对你之前脚本中处理的特定情况进行保留，例如 wbapplua/wbpullad.lua
    if (requestUrl.includes("wbapplua/wbpullad.lua")) {
        if (obj.cached_ad && Array.isArray(obj.cached_ad.ads)) {
            obj.cached_ad.ads = [];
        }
    }

    // 针对你之前脚本中处理的特定情况进行保留，例如 sdkad.php
    if (requestUrl.includes("/interface/sdk/sdkad.php")) {
        // 这段逻辑保留了之前对 sdkad.php 的特定处理
        let tempMatch = $response.body.match(/\{.*\}/);
        if (tempMatch) {
            try {
                let parsedTemp = JSON.parse(tempMatch[0]);
                if (parsedTemp.ads) parsedTemp.ads = [];
                if (parsedTemp.background_delay_display_time) parsedTemp.background_delay_display_time = 60 * 60 * 24 * 1000;
                if (parsedTemp.show_push_splash_ad) parsedTemp.show_push_splash_ad = false;
                obj = parsedTemp; // 将修改后的 parsedTemp 赋值给 obj
            } catch (e) {
                console.error("Error parsing sdkad.php matched JSON:", e);
                // Fallback to original obj if parsing fails
            }
        }
    }


    // 返回修改后的 JSON 响应
    $done({ body: JSON.stringify(obj) });

} else {
    // 如果不是目标域名，则不做任何修改，直接返回原始响应
    $done({ body: $response.body });
}

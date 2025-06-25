/*
 * www.iios.fun 网站自动签到+看视频脚本
 * 目标：每日获得4积分
 * 平台：理论上支持青龙、Quantumult X 等
 *
 * 青龙环境变量:
 * iios_Val = '你的Authorization令牌'
 *
 * Quantumult X 配置:
 * [rewrite_local]
 * ^https:\/\/www\.iios\.fun\/api\/(base|user\/info)$ url script-request-header https://raw.githubusercontent.com/wf021325/qx/master/task/iios.js
 *
 * [task_local]
 * 1 0 * * * https://raw.githubusercontent.com/wf021325/qx/master/task/iios.js, tag=iios签到, enabled=true
 *
 * [mitm]
 * hostname = www.iios.fun
 */

// =================================================================================
//  SECTION 1: 环境设置 (通用脚本模板)
// =================================================================================
const $ = new Env("iios签到");
const AUTH_KEY = 'iios_Val'; // 用于存储Authorization令牌的键名
$.ck = $.getdata(AUTH_KEY) || ($.isNode() ? process.env[AUTH_KEY] : '');

const notify = $.isNode() ? require('./sendNotify') : '';
let message = '';
let taskType = ''; // 用于区分任务类型（2为签到, 3为看视频）

// 引入加密库的占位符
let huihui, RSA;

// =================================================================================
// SECTION 2: 主逻辑 (脚本入口)
// =================================================================================
!(async () => {
    // 如果是$request环境 (由Quantumult X的rewrite触发)，则执行获取令牌逻辑
    if (typeof $request !== "undefined") {
        getToken();
        return;
    }

    // 初始化AES和RSA加密库
    intaes();
    intrsa();

    // 检查是否有可用的Authorization令牌
    if (!$.ck) {
        message = '❌ Authorization令牌为空，请先获取！';
        await SendMsg(message);
        return;
    }

    message += `---------- iios签到任务开始 ----------\n`;

    console.log("开始执行签到任务...");
    taskType = '2'; // 任务类型2：签到
    await signIn();

    console.log("开始执行看视频任务...");
    taskType = '3'; // 任务类型3：看视频
    await signIn();

    // 作者添加的脚本失效通知
    // message = '网站更新，脚本失效\n暂时无解，感谢使用\n@wangfei021325';

    // 发送最终的通知消息
    await SendMsg(message);

})()
.catch((e) => {
    $.log("", `❌ 执行失败! 原因: ${e}!`, "");
})
.finally(() => {
    $.done();
});

// =================================================================================
// SECTION 3: 核心功能函数
// =================================================================================

/**
 * @description 在rewrite环境下，从请求头中捕获并存储Authorization令牌
 */
function getToken() {
    if ($request && $request.method !== 'OPTIONS') {
        const authValue = $request.headers['Authorization'] || $request.headers['authorization'];
        if (authValue) {
            $.setdata(authValue, AUTH_KEY);
            $.msg($.name, '🎉 获取Authorization成功!', `请禁用rewrite以避免重复获取`);
        } else {
            $.msg($.name, '❌ 获取Authorization失败', '未在请求头中找到Authorization字段');
        }
    }
}

/**
 * @description 生成一个指定长度的随机字符串，用作AES加密的密钥
 * @param {number} length 密钥长度，默认为16
 * @returns {string} 随机生成的字符串
 */
function generateRandomKey(length = 16) {
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    let result = "";
    for (let i = 0; i < length; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
}

/**
 * @description 执行签到或看视频的核心函数
 */
function signIn() {
    return new Promise((resolve) => {
        // 1. 生成一个随机的16位AES密钥
        const aesKey = generateRandomKey();

        // 2. 准备请求参数
        const requestConfig = {
            url: 'https://www.iios.fun/api/task',
            // 3. 将请求体用AES加密
            body: AES_Encrypt(`{"type":${taskType},"webapp":true}`, aesKey),
            headers: {
                'Content-Type': 'text/plain',
                'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0.0 Mobile/15E148 Safari/604.1',
                // 4. 将AES密钥用RSA公钥加密，并放入Sign头
                'Sign': RSA_Public_Encrypt(aesKey),
                // 5. 放入用户的身份令牌
                'Authorization': $.ck
            }
        };

        // 6. 发送POST请求
        $.post(requestConfig, (err, resp, data) => {
            try {
                if (err) {
                    message += `任务类型${taskType}: 请求失败，错误: ${err}\n`;
                    return;
                }
                // 7. 将收到的加密响应数据用同一个AES密钥解密
                const decryptedData = AES_Decrypt(data, aesKey);
                const resultObj = JSON.parse(decryptedData);

                // 8. 处理解密后的结果
                if (resultObj?.success === true) {
                    message += `任务类型${taskType}: 成功! 获得 ${resultObj?.result.points} 积分\n`;
                } else {
                    message += `任务类型${taskType}: 失败! 原因: ${resultObj?.message}\n`;
                }
            } catch (e) {
                $.logErr(e, "❌ 解密或解析响应失败，请检查Authorization是否已过期");
                message += `任务类型${taskType}: 响应处理异常，可能是令牌失效\n`;
            } finally {
                resolve();
            }
        });
    });
}

/**
 * @description 发送通知 (兼容Node.js和浏览器环境)
 * @param {string} message 要发送的消息内容
 */
async function SendMsg(message) {
    if ($.isNode()) {
        await notify.sendNotify($.name, message);
    } else {
        $.msg($.name, "", message);
    }
}


// =================================================================================
// SECTION 4: 嵌入的加密库
// =================================================================================

/**
 * @description AES加密函数 (调用AES库)
 * @param {string} text 待加密的明文
 * @param {string} key AES密钥
 * @returns {string} 加密后的密文
 */
function AES_Encrypt(text, key) {
    const key_utf8 = huihui.enc.Utf8.parse(key);
    const text_utf8 = huihui.enc.Utf8.parse(text);
    const encrypted = huihui.AES.encrypt(text_utf8, key_utf8, {
        mode: huihui.mode.ECB,
        padding: huihui.pad.Pkcs7
    });
    return encrypted.toString();
}

/**
 * @description AES解密函数 (调用AES库)
 * @param {string} encryptedText 待解密的密文
 * @param {string} key AES密钥
 * @returns {string} 解密后的明文
 */
function AES_Decrypt(encryptedText, key) {
    const key_utf8 = huihui.enc.Utf8.parse(key);
    const decrypted = huihui.AES.decrypt(encryptedText, key_utf8, {
        mode: huihui.mode.ECB,
        padding: huihui.pad.Pkcs7
    });
    return decrypted.toString(huihui.enc.Utf8);
}


/**
 * @description RSA公钥加密函数 (调用RSA库)
 * @param {string} text 待加密的明文 (这里是AES密钥)
 * @returns {string} Base64编码的加密后密文
 */
function RSA_Public_Encrypt(text) {
    const rsaEncryptor = new RSA.JSEncrypt();
    const publicKey = `-----BEGIN PUBLIC KEY-----
MIGeMA0GCSqGSIb3DQEBAQUAA4GMADCBiAKBgE8/mRyYJwyMjSGNL9ClZzkly2+S
oSXiPcyH6t2sfmgpgJEn9uuQRG+VeBIaAurtfkGxwb+gzY2dEJED1KhZtj/H5koP
hZq5MnJuAEDE6YlL61ELJY5PPRWPl2MO5aWsaX32dfXlrdDsKx+UlLbwDjagMVo0
Z/GiODO6yGbYp8wZAgMBAAE=
-----END PUBLIC KEY-----`;
    rsaEncryptor.setPublicKey(publicKey);
    // 使用长加密模式，padding模式为2(PKCS1_OAEP)，输出为Base64
    return rsaEncryptor.public_encryptLong(text, 2, true);
}


/**
 * @description 初始化AES库 (CryptoJS的嵌入式版本)
 */
function intaes() {
    // 此处为原脚本中压缩的CryptoJS AES库代码
    // 为了可读性，这里不展开，仅说明其功能
    // 它在全局作用域创建了名为`huihui`的对象，即CryptoJS实例
    var t;huihui=function(t,e){var r;if("undefined"!=typeof window&&window.crypto&&(r=window.crypto),"undefined"!=typeof self&&self.crypto&&(r=self.crypto),"undefined"!=typeof globalThis&&globalThis.crypto&&(r=globalThis.crypto),!r&&"undefined"!=typeof window&&window.msCrypto&&(r=window.msCrypto),!r&&"undefined"!=typeof global&&global.crypto&&(r=global.crypto),!r&&"function"==typeof require)try{r=require("crypto")}catch(t){}var i=function(){if(r){if("function"==typeof r.getRandomValues)try{return r.getRandomValues(new Uint32Array(1))[0]}catch(t){}if("function"==typeof r.randomBytes)try{return r.randomBytes(4).readInt32LE()}catch(t){}}throw new Error("Native crypto module could not be used to get secure random number.")},n=Object.create||function(){function t(){}return function(e){var r;return t.prototype=e,r=new t,t.prototype=null,r}}(),o={},c=o.lib={},s=c.Base={extend:function(t){var e=n(this);return t&&e.mixIn(t),e.hasOwnProperty("init")&&this.init!==e.init||(e.init=function(){e.$super.init.apply(this,arguments)}),e.init.prototype=e,e.$super=this,e},create:function(){var t=this.extend();return t.init.apply(t,arguments),t},init:function(){},mixIn:function(t){for(var e in t)t.hasOwnProperty(e)&&(this[e]=t[e]);t.hasOwnProperty("toString")&&(this.toString=t.toString)},clone:function(){return this.init.prototype.extend(this)}},a=c.WordArray=s.extend({init:function(t,e){t=this.words=t||[],this.sigBytes=null!=e?e:4*t.length},toString:function(t){return(t||h).stringify(this)},concat:function(t){var e=this.words,r=t.words,i=this.sigBytes,n=t.sigBytes;if(this.clamp(),i%4)for(var o=0;o<n;o++){var c=r[o>>>2]>>>24-o%4*8&255;e[i+o>>>2]|=c<<24-(i+o)%4*8}else for(var s=0;s<n;s+=4)e[i+s>>>2]=r[s>>>2];return this.sigBytes+=n,this},clamp:function(){var e=this.words,r=this.sigBytes;e[r>>>2]&=4294967295<<32-r%4*8,e.length=t.ceil(r/4)},clone:function(){var t=s.clone.call(this);return t.words=this.words.slice(0),t},random:function(e){var r,n=[],o=function(e){e=e;var r=987654321,i=4294967295;return function(){var n=((r=36969*(65535&r)+(r>>16)&i)<<16)+(e=18e3*(65535&e)+(e>>16)&i)&i;return n/=4294967296,(n+=.5)*(t.random()>.5?1:-1)}},c=!1;try{i(),c=!0}catch(t){}for(var s,u=0;u<e;u+=4)c?n.push(i()):(s=987654071*(r=o(4294967296*(s||t.random())))(),n.push(4294967296*r()|0));return new a.init(n,e)}}),u=o.enc={},h=u.Hex={stringify:function(t){for(var e=t.words,r=t.sigBytes,i=[],n=0;n<r;n++){var o=e[n>>>2]>>>24-n%4*8&255;i.push((o>>>4).toString(16)),i.push((15&o).toString(16))}return i.join("")},parse:function(t){for(var e=t.length,r=[],i=0;i<e;i+=2)r[i>>>3]|=parseInt(t.substr(i,2),16)<<24-i%8*4;return new a.init(r,e/2)}},f=u.Latin1={stringify:function(t){for(var e=t.words,r=t.sigBytes,i=[],n=0;n<r;n++){var o=e[n>>>2]>>>24-n%4*8&255;i.push(String.fromCharCode(o))}return i.join("")},parse:function(t){for(var e=t.length,r=[],i=0;i<e;i++)r[i>>>2]|=(255&t.charCodeAt(i))<<24-i%4*8;return new a.init(r,e)}},p=u.Utf8={stringify:function(t){try{return decodeURIComponent(escape(f.stringify(t)))}catch(t){throw new Error("Malformed UTF-8 data")}},parse:function(t){return f.parse(unescape(encodeURIComponent(t)))}},d=c.BufferedBlockAlgorithm=s.extend({reset:function(){this._data=new a.init,this._nDataBytes=0},_append:function(t){"string"==typeof t&&(t=p.parse(t)),this._data.concat(t),this._nDataBytes+=t.sigBytes},_process:function(e){var r,i=this._data,n=i.words,o=i.sigBytes,c=this.blockSize,s=o/(4*c),u=(s=e?t.ceil(s):t.max((0|s)-this._minBufferSize,0))*c,h=t.min(4*u,o);if(u){for(var f=0;f<u;f+=c)this._doProcessBlock(n,f);r=n.splice(0,u),i.sigBytes-=h}return new a.init(r,h)},clone:function(){var t=s.clone.call(this);return t._data=this._data.clone(),t},_minBufferSize:0}),l=(c.Hasher=d.extend({cfg:s.extend(),init:function(t){this.cfg=this.cfg.extend(t),this.reset()},reset:function(){d.reset.call(this),this._doReset()},update:function(t){return this._append(t),this._process(),this},finalize:function(t){return t&&this._append(t),this._doFinalize()},blockSize:16,_createHelper:function(t){return function(e,r){return new t.init(r).finalize(e)}},_createHmacHelper:function(t){return function(e,r){return new l.HMAC.init(t,r).finalize(e)}}}),o.algo={});return o}(Math),function(){var t=huihui,e=t.lib.WordArray;t.enc.Base64={stringify:function(t){var e=t.words,r=t.sigBytes,i=this._map;t.clamp();for(var n=[],o=0;o<r;o+=3)for(var c=(e[o>>>2]>>>24-o%4*8&255)<<16|(e[o+1>>>2]>>>24-(o+1)%4*8&255)<<8|e[o+2>>>2]>>>24-(o+2)%4*8&255,s=0;s<4&&o+.75*s<r;s++)n.push(i.charAt(c>>>6*(3-s)&63));var a=i.charAt(64);if(a)for(;n.length%4;)n.push(a);return n.join("")},parse:function(t){var r=t.length,i=this._map,n=this._reverseMap;if(!n){n=this._reverseMap=[];for(var o=0;o<i.length;o++)n[i.charCodeAt(o)]=o}var c=i.charAt(64);if(c){var s=t.indexOf(c);-1!==s&&(r=s)}return function(t,r,i){for(var n=[],o=0,c=0;c<r

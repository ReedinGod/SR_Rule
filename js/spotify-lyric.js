/*
Spotify非中文歌词翻译 Surge和Loon需要>=iOS15 (仓库地址: https://github.com/app2smile/rules)
采用硅基流动接口进行翻译,需要先免费申请API Key,然后根据不同软件进行不同配置

-----------申请硅基流动API Key--------------
1. 访问官网并注册: https://siliconflow.cn/
2. 登录后,在 "账户设置" -> "API密钥" 页面创建一个新的密钥.

------------软件配置(在文本模式下,填入下方内容)--------------
如果软件已经加载过Spotify解锁脚本(https://github.com/app2smile/rules#spotify),可不配置MITM域名

1.Surge:
[MITM]
hostname = %APPEND% spclient.wg.spotify.com
[Script]
# 修改下方argument中的apiKey, 填入你自己的密钥
spotify歌词翻译 = type=http-response,pattern=^https:\/\/spclient\.wg\.spotify\.com\/color-lyrics\/v2\/track\/,requires-body=1,binary-body-mode=1,max-size=0,script-path=https://raw.githubusercontent.com/app2smile/rules/master/js/spotify-lyric-siliconflow.js,argument=apiKey=sk-xxxxxxxxxxxxxxxxxxxxxxxx

2.Loon:
[Mitm]
hostname = spclient.wg.spotify.com
[Script]
# 修改下方argument中的apiKey, 填入你自己的密钥
http-response ^https:\/\/spclient\.wg\.spotify\.com\/color-lyrics\/v2\/track\/ script-path=https://raw.githubusercontent.com/app2smile/rules/master/js/spotify-lyric-siliconflow.js, requires-body=true, binary-body-mode=true, timeout=10, tag=Spotify歌词翻译, argument=apiKey=sk-xxxxxxxxxxxxxxxxxxxxxxxx

3.qx:
    - 自行配置MITM域名: spclient.wg.spotify.com
    - 手动修改下方的 apiKey 常量, 填入你自己的密钥, 并配置重写,类型为script-response-body,
      正则填入^https:\/\/spclient\.wg\.spotify\.com\/color-lyrics\/v2\/track\/
*/
// 注意: QX用户需要手动填入appid和securityKey密钥, Surge和Loon用户无需填入!!!!
// === 修改部分开始 ===
const notifyName = 'Spotify 歌词翻译';
const isQX = typeof $response !== 'undefined' && typeof $httpClient !== 'undefined';

// 检查响应体
if (!$response || !$response.body) {
    console.log('错误：未找到 $response 或 $response.body');
    $notify(notifyName, '脚本错误', '未找到响应体');
    $done({});
}

// 解析二进制响应
let colorLyricsResponseObj;
try {
    console.log('原始响应体长度：', $response.body.length);
    // 假设 ColorLyricsResponse 是外部定义的解析函数
    colorLyricsResponseObj = ColorLyricsResponse.fromBinary($response.body);
    console.log('解析后的 colorLyricsResponseObj：', JSON.stringify(colorLyricsResponseObj));
} catch (error) {
    console.log('解析 colorLyricsResponseObj 失败：', error.message);
    $notify(notifyName, '解析错误', `无法解析响应体: ${error.message}`);
    $done({});
}

// 检查 lyrics.lines
if (!colorLyricsResponseObj?.lyrics?.lines?.length) {
    console.log('歌词为空，跳过翻译');
    $notify(notifyName, '歌词为空', '响应数据缺少有效歌词');
    $done({ body: $response.body });
}

const options = {
    apiKey: 'sk-zsooyiczhuuezogpqthqssmjwuqfytnfmcpjubitnftybhgz',
    model: 'Qwen/Qwen2.5-7B-Instruct',
    baseUrl: 'https://api.siliconflow.cn/v1',
};

// 解析 $argument
if (typeof $argument !== 'undefined') {
    console.log(`$argument: ${$argument}`);
    try {
        const params = Object.fromEntries($argument.split('&').map(item => item.split('=')));
        Object.assign(options, params);
    } catch (error) {
        console.log(`解析 $argument 失败: ${error.message}`);
        $notify(notifyName, '配置错误', `解析 $argument 失败: ${error.message}`);
        $done({});
    }
}
if (!options.apiKey || !options.model) {
    console.log('缺少 apiKey 或 model 配置');
    $notify(notifyName, '配置错误', '缺少 apiKey 或 model 配置');
    $done({});
}

const query = colorLyricsResponseObj.lyrics.lines
    .map(x => x.words)
    .filter(words => words && words !== '♪')
    .filter((v, i, a) => a.indexOf(v) === i)
    .join('\n');
if (!query) {
    console.log('歌词内容为空，不翻译');
    $notify(notifyName, '歌词为空', '歌词内容为空，不翻译');
    $done({});
}

const requestBody = JSON.stringify({
    model: options.model,
    messages: [
        {
            role: 'system',
            content: 'You are a translator. Translate the following text to Chinese (zh).'
        },
        {
            role: 'user',
            content: query
        }
    ],
    max_tokens: 4096,
    temperature: 0.7
});

commonApi.post({
    url: `${options.baseUrl}/chat/completions`,
    body: requestBody,
    headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${options.apiKey}`
    },
}, (error, response, data) => {
    console.log(`API Request: url=${options.baseUrl}/chat/completions, body=${requestBody}`);
    if (error) {
        console.log(`API Error: ${JSON.stringify(error)}`);
        $notify(notifyName, '硅基流动翻译', `请求错误: ${error.message || error}`);
        $done({});
    } else if (response.status !== 200) {
        console.log(`API Status: ${response.status}, Response: ${data}`);
        $notify(notifyName, '硅基流动翻译', `响应不为200: ${response.status}`);
        $done({});
    } else {
        try {
            console.log(`Raw API Response: ${data}`);
            const siliconResult = JSON.parse(data);
            if (siliconResult.error) {
                console.log(`API Error Response: ${JSON.stringify(siliconResult.error)}`);
                $notify(notifyName, '硅基流动翻译', `API错误: ${siliconResult.error.message}`);
                $done({});
            }
            console.log('翻译成功');
            const translatedText = siliconResult.choices?.[0]?.message?.content;
            if (!translatedText) {
                console.log('翻译结果为空');
                $notify(notifyName, '硅基流动翻译', '翻译结果为空');
                $done({});
            }
            const transLines = translatedText.split('\n');
            const srcLines = colorLyricsResponseObj.lyrics.lines
                .map(x => x.words)
                .filter(words => words && words !== '♪')
                .filter((v, i, a) => a.indexOf(v) === i);
            if (transLines.length < srcLines.length) {
                console.log(`翻译结果行数不足: expected ${srcLines.length}, got ${transLines.length}`);
                $notify(notifyName, '硅基流动翻译', '翻译结果行数不足');
                $done({});
            }
            const transMap = new Map(srcLines.map((src, i) => [src, transLines[i] || src]));
            colorLyricsResponseObj.lyrics.alternatives = [{
                "language": "z1",
                "lines": colorLyricsResponseObj.lyrics.lines.map(line => line.words)
                    .map(word => transMap.get(word) || word || '')
            }];
            const body = ColorLyricsResponse.toBinary(colorLyricsResponseObj);
            if (isQX) {
                $done({ bodyBytes: body.buffer.slice(body.byteOffset, body.byteLength + body.byteOffset) });
            } else {
                $done({ body });
            }
        } catch (parseError) {
            console.log(`解析响应失败: ${parseError.message}`);
            $notify(notifyName, '硅基流动翻译', `解析响应失败: ${parseError.message}`);
            $done({});
        }
    }
});
// === 修改部分结束 ===
// https://github.com/chavyleung/scripts/blob/master/Env.min.js
function Env(t,e){class s{constructor(t){this.env=t}send(t,e="GET"){t="string"==typeof t?{url:t}:t;let s=this.get;return"POST"===e&&(s=this.post),new Promise((e,i)=>{s.call(this,t,(t,s,r)=>{t?i(t):e(s)})})}get(t){return this.send.call(this.env,t)}post(t){return this.send.call(this.env,t,"POST")}}return new class{constructor(t,e){this.name=t,this.http=new s(this),this.data=null,this.dataFile="box.dat",this.logs=[],this.isMute=!1,this.isNeedRewrite=!1,this.logSeparator="\n",this.encoding="utf-8",this.startTime=(new Date).getTime(),Object.assign(this,e),this.log("",`🔔${this.name}, 开始!`)}isNode(){return"undefined"!=typeof module&&!!module.exports}isQuanX(){return"undefined"!=typeof $task}isSurge(){return"undefined"!=typeof $httpClient&&"undefined"==typeof $loon}isLoon(){return"undefined"!=typeof $loon}isShadowrocket(){return"undefined"!=typeof $rocket}isStash(){return"undefined"!=typeof $environment&&$environment["stash-version"]}toObj(t,e=null){try{return JSON.parse(t)}catch{return e}}toStr(t,e=null){try{return JSON.stringify(t)}catch{return e}}getjson(t,e){let s=e;const i=this.getdata(t);if(i)try{s=JSON.parse(this.getdata(t))}catch{}return s}setjson(t,e){try{return this.setdata(JSON.stringify(t),e)}catch{return!1}}getScript(t){return new Promise(e=>{this.get({url:t},(t,s,i)=>e(i))})}runScript(t,e){return new Promise(s=>{let i=this.getdata("@chavy_boxjs_userCfgs.httpapi");i=i?i.replace(/\n/g,"").trim():i;let r=this.getdata("@chavy_boxjs_userCfgs.httpapi_timeout");r=r?1*r:20,r=e&&e.timeout?e.timeout:r;const[o,n]=i.split("@"),a={url:`http://${n}/v1/scripting/evaluate`,body:{script_text:t,mock_type:"cron",timeout:r},headers:{"X-Key":o,Accept:"*/*"}};this.post(a,(t,e,i)=>s(i))}).catch(t=>this.logErr(t))}loaddata(){if(!this.isNode())return{};{this.fs=this.fs?this.fs:require("fs"),this.path=this.path?this.path:require("path");const t=this.path.resolve(this.dataFile),e=this.path.resolve(process.cwd(),this.dataFile),s=this.fs.existsSync(t),i=!s&&this.fs.existsSync(e);if(!s&&!i)return{};{const i=s?t:e;try{return JSON.parse(this.fs.readFileSync(i))}catch(t){return{}}}}}writedata(){if(this.isNode()){this.fs=this.fs?this.fs:require("fs"),this.path=this.path?this.path:require("path");const t=this.path.resolve(this.dataFile),e=this.path.resolve(process.cwd(),this.dataFile),s=this.fs.existsSync(t),i=!s&&this.fs.existsSync(e),r=JSON.stringify(this.data);s?this.fs.writeFileSync(t,r):i?this.fs.writeFileSync(e,r):this.fs.writeFileSync(t,r)}}lodash_get(t,e,s){const i=e.replace(/\[(\d+)\]/g,".$1").split(".");let r=t;for(const t of i)if(r=Object(r)[t],void 0===r)return s;return r}lodash_set(t,e,s){return Object(t)!==t?t:(Array.isArray(e)||(e=e.toString().match(/[^.[\]]+/g)||[]),e.slice(0,-1).reduce((t,s,i)=>Object(t[s])===t[s]?t[s]:t[s]=Math.abs(e[i+1])>>0==+e[i+1]?[]:{},t)[e[e.length-1]]=s,t)}getdata(t){let e=this.getval(t);if(/^@/.test(t)){const[,s,i]=/^@(.*?)\.(.*?)$/.exec(t),r=s?this.getval(s):"";if(r)try{const t=JSON.parse(r);e=t?this.lodash_get(t,i,""):e}catch(t){e=""}}return e}setdata(t,e){let s=!1;if(/^@/.test(e)){const[,i,r]=/^@(.*?)\.(.*?)$/.exec(e),o=this.getval(i),n=i?"null"===o?null:o||"{}":"{}";try{const e=JSON.parse(n);this.lodash_set(e,r,t),s=this.setval(JSON.stringify(e),i)}catch(e){const o={};this.lodash_set(o,r,t),s=this.setval(JSON.stringify(o),i)}}else s=this.setval(t,e);return s}getval(t){return this.isSurge()||this.isLoon()?$persistentStore.read(t):this.isQuanX()?$prefs.valueForKey(t):this.isNode()?(this.data=this.loaddata(),this.data[t]):this.data&&this.data[t]||null}setval(t,e){return this.isSurge()||this.isLoon()?$persistentStore.write(t,e):this.isQuanX()?$prefs.setValueForKey(t,e):this.isNode()?(this.data=this.loaddata(),this.data[e]=t,this.writedata(),!0):this.data&&this.data[e]||null}initGotEnv(t){this.got=this.got?this.got:require("got"),this.cktough=this.cktough?this.cktough:require("tough-cookie"),this.ckjar=this.ckjar?this.ckjar:new this.cktough.CookieJar,t&&(t.headers=t.headers?t.headers:{},void 0===t.headers.Cookie&&void 0===t.cookieJar&&(t.cookieJar=this.ckjar))}get(t,e=(()=>{})){if(t.headers&&(delete t.headers["Content-Type"],delete t.headers["Content-Length"]),this.isSurge()||this.isLoon())this.isSurge()&&this.isNeedRewrite&&(t.headers=t.headers||{},Object.assign(t.headers,{"X-Surge-Skip-Scripting":!1})),$httpClient.get(t,(t,s,i)=>{!t&&s&&(s.body=i,s.statusCode=s.status?s.status:s.statusCode,s.status=s.statusCode),e(t,s,i)});else if(this.isQuanX())this.isNeedRewrite&&(t.opts=t.opts||{},Object.assign(t.opts,{hints:!1})),$task.fetch(t).then(t=>{const{statusCode:s,statusCode:i,headers:r,body:o}=t;e(null,{status:s,statusCode:i,headers:r,body:o},o)},t=>e(t&&t.error||"UndefinedError"));else if(this.isNode()){let s=require("iconv-lite");this.initGotEnv(t),this.got(t).on("redirect",(t,e)=>{try{if(t.headers["set-cookie"]){const s=t.headers["set-cookie"].map(this.cktough.Cookie.parse).toString();s&&this.ckjar.setCookieSync(s,null),e.cookieJar=this.ckjar}}catch(t){this.logErr(t)}}).then(t=>{const{statusCode:i,statusCode:r,headers:o,rawBody:n}=t,a=s.decode(n,this.encoding);e(null,{status:i,statusCode:r,headers:o,rawBody:n,body:a},a)},t=>{const{message:i,response:r}=t;e(i,r,r&&s.decode(r.rawBody,this.encoding))})}}post(t,e=(()=>{})){const s=t.method?t.method.toLocaleLowerCase():"post";if(t.body&&t.headers&&!t.headers["Content-Type"]&&(t.headers["Content-Type"]="application/x-www-form-urlencoded"),t.headers&&delete t.headers["Content-Length"],this.isSurge()||this.isLoon())this.isSurge()&&this.isNeedRewrite&&(t.headers=t.headers||{},Object.assign(t.headers,{"X-Surge-Skip-Scripting":!1})),$httpClient[s](t,(t,s,i)=>{!t&&s&&(s.body=i,s.statusCode=s.status?s.status:s.statusCode,s.status=s.statusCode),e(t,s,i)});else if(this.isQuanX())t.method=s,this.isNeedRewrite&&(t.opts=t.opts||{},Object.assign(t.opts,{hints:!1})),$task.fetch(t).then(t=>{const{statusCode:s,statusCode:i,headers:r,body:o}=t;e(null,{status:s,statusCode:i,headers:r,body:o},o)},t=>e(t&&t.error||"UndefinedError"));else if(this.isNode()){let i=require("iconv-lite");this.initGotEnv(t);const{url:r,...o}=t;this.got[s](r,o).then(t=>{const{statusCode:s,statusCode:r,headers:o,rawBody:n}=t,a=i.decode(n,this.encoding);e(null,{status:s,statusCode:r,headers:o,rawBody:n,body:a},a)},t=>{const{message:s,response:r}=t;e(s,r,r&&i.decode(r.rawBody,this.encoding))})}}time(t,e=null){const s=e?new Date(e):new Date;let i={"M+":s.getMonth()+1,"d+":s.getDate(),"H+":s.getHours(),"m+":s.getMinutes(),"s+":s.getSeconds(),"q+":Math.floor((s.getMonth()+3)/3),S:s.getMilliseconds()};/(y+)/.test(t)&&(t=t.replace(RegExp.$1,(s.getFullYear()+"").substr(4-RegExp.$1.length)));for(let e in i)new RegExp("("+e+")").test(t)&&(t=t.replace(RegExp.$1,1==RegExp.$1.length?i[e]:("00"+i[e]).substr((""+i[e]).length)));return t}queryStr(t){let e="";for(const s in t){let i=t[s];null!=i&&""!==i&&("object"==typeof i&&(i=JSON.stringify(i)),e+=`${s}=${i}&`)}return e=e.substring(0,e.length-1),e}msg(e=t,s="",i="",r){const o=t=>{if(!t)return t;if("string"==typeof t)return this.isLoon()?t:this.isQuanX()?{"open-url":t}:this.isSurge()?{url:t}:void 0;if("object"==typeof t){if(this.isLoon()){let e=t.openUrl||t.url||t["open-url"],s=t.mediaUrl||t["media-url"];return{openUrl:e,mediaUrl:s}}if(this.isQuanX()){let e=t["open-url"]||t.url||t.openUrl,s=t["media-url"]||t.mediaUrl,i=t["update-pasteboard"]||t.updatePasteboard;return{"open-url":e,"media-url":s,"update-pasteboard":i}}if(this.isSurge()){let e=t.url||t.openUrl||t["open-url"];return{url:e}}}};if(this.isMute||(this.isSurge()||this.isLoon()?$notification.post(e,s,i,o(r)):this.isQuanX()&&$notify(e,s,i,o(r))),!this.isMuteLog){let t=["","==============📣系统通知📣=============="];t.push(e),s&&t.push(s),i&&t.push(i),console.log(t.join("\n")),this.logs=this.logs.concat(t)}}log(...t){t.length>0&&(this.logs=[...this.logs,...t]),console.log(t.join(this.logSeparator))}logErr(t,e){const s=!this.isSurge()&&!this.isQuanX()&&!this.isLoon();s?this.log("",`❗️${this.name}, 错误!`,t.stack):this.log("",`❗️${this.name}, 错误!`,t)}wait(t){return new Promise(e=>setTimeout(e,t))}done(t={}){const e=(new Date).getTime(),s=(e-this.startTime)/1e3;this.log("",`🔔${this.name}, 结束! 🕛 ${s} 秒`),this.log(),this.isSurge()||this.isQuanX()||this.isLoon()?$done(t):this.isNode()&&process.exit(1)}}(t,e)}

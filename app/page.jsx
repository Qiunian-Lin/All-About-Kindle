"use client";
import { useState, useRef, useEffect } from "react";

// ─── DATA ───────────────────────────────────────────────────────────────────

const MODELS = [
  { era:"current", series:"colorsoft", badges:[{label:"2024 新款",color:"#2d7a3a"},{label:"彩色屏",color:"#7a3a6a"}], model:"Kindle Colorsoft", gen:"第 1 代 · 2024年10月", price:"¥1,499", specs:[["屏幕尺寸","7 英寸"],["屏幕类型","彩色 Paperwhite"],["分辨率","300 ppi"],["色域","sRGB 专利冷暖调节"],["存储","32 GB"],["防水","IPX8（2m/60min）"],["续航","约 8 周"],["充电","USB-C"],["重量","218 g"]], highlight:"漫画爱好者、多类型阅读者、对色彩有需求的读者" },
  { era:"current", series:"paperwhite", badges:[{label:"最受欢迎",color:"#8b3a2a"}], model:"Kindle Paperwhite SE", gen:"第 12 代 Signature Edition · 2024", price:"¥1,058", specs:[["屏幕尺寸","7 英寸"],["分辨率","300 ppi"],["亮度","最高 35 级 · 自动感应"],["色温调节","冷暖可调 ✓"],["存储","32 GB"],["防水","IPX8"],["无线充","Qi 无线充电 ✓"],["续航","约 12 周"],["重量","209 g"]], highlight:"绝大多数人的最优选，功能完整、价格合理" },
  { era:"current", series:"paperwhite", badges:[{label:"标准版",color:"#c8860a"}], model:"Kindle Paperwhite", gen:"第 12 代 标准版 · 2024", price:"¥858", specs:[["屏幕尺寸","7 英寸"],["分辨率","300 ppi"],["亮度","最高 35 级"],["色温调节","无"],["存储","16 GB"],["防水","IPX8"],["续航","约 12 周"],["充电","USB-C"],["重量","209 g"]], highlight:"预算 900 元以内、主要阅读小说的读者" },
  { era:"current", series:"basic", badges:[{label:"入门首选",color:"#c8860a"}], model:"Kindle 基础款", gen:"第 16 代 · 2024", price:"¥558", specs:[["屏幕尺寸","6 英寸"],["分辨率","300 ppi"],["亮度","最高 17 级"],["存储","16 GB"],["防水","无"],["续航","约 6 周"],["充电","USB-C"],["重量","158 g"]], highlight:"首次体验电子墨水屏、预算 600 以内的新手" },
  { era:"current", series:"scribe", badges:[{label:"旗舰书写",color:"#4a4a7a"}], model:"Kindle Scribe", gen:"第 2 代 · 2024", price:"¥2,399 起", specs:[["屏幕尺寸","10.2 英寸"],["分辨率","300 ppi"],["存储","16/32/64 GB"],["手写笔","随附 Premium Pen"],["笔延迟","极低（<10ms）"],["防水","无"],["续航","约 12 周"],["重量","433 g"]], highlight:"需要手写笔记、批注 PDF 的重度用户" },
  { era:"legacy", series:"paperwhite", badges:[{label:"已停产",color:"#4a4a4a"}], model:"Kindle Paperwhite", gen:"第 11 代 · 2021", price:"二手约 ¥400–600", specs:[["屏幕","6.8\" / 300 ppi"],["存储","8/32 GB"],["防水","IPX8"],["充电","USB-C（首次）"],["续航","约 10 周"]], highlight:"PW 系列首次升级至 6.8\" 大屏，USB-C，二手极具性价比" },
  { era:"legacy", series:"paperwhite", badges:[{label:"已停产",color:"#4a4a4a"}], model:"Kindle Paperwhite", gen:"第 10 代 · 2018", price:"二手约 ¥200–350", specs:[["屏幕","6\" / 300 ppi"],["存储","8/32 GB"],["防水","IPX8（PW 首次）"],["充电","Micro-USB"]], highlight:"首款防水 Paperwhite，经典之作" },
  { era:"legacy", series:"paperwhite", badges:[{label:"已停产",color:"#4a4a4a"}], model:"Kindle Paperwhite", gen:"第 3 代 · 2015", price:"二手约 ¥100–200", specs:[["屏幕","6\" / 300 ppi（首次）"],["存储","4 GB"],["防水","无"],["充电","Micro-USB"]], highlight:"首款 300 ppi 高清屏 Kindle，跨时代里程碑" },
  { era:"legacy", series:"oasis", badges:[{label:"旗舰停产",color:"#4a4a7a"}], model:"Kindle Oasis", gen:"第 3 代 · 2019", price:"二手约 ¥600–1,000", specs:[["屏幕","7\" / 300 ppi"],["存储","8/32 GB"],["防水","IPX8"],["色温调节","冷暖可调（首次）"],["实体翻页键","✓ 铝合金机身"],["充电","Micro-USB"]], highlight:"实体翻页键 + 7\" 大屏 + 冷暖调光，旗舰体验天花板" },
  { era:"legacy", series:"oasis", badges:[{label:"已停产",color:"#4a4a4a"}], model:"Kindle Oasis", gen:"第 2 代 · 2017", price:"二手约 ¥400–700", specs:[["屏幕","7\" / 300 ppi"],["存储","8/32 GB"],["防水","IPX7"],["实体翻页键","✓"],["充电","Micro-USB"]], highlight:"首款 7\" Oasis，铝合金非对称旗舰设计" },
  { era:"legacy", series:"oasis", badges:[{label:"已停产",color:"#4a4a4a"}], model:"Kindle Oasis", gen:"第 1 代 · 2016", price:"二手约 ¥200–400", specs:[["屏幕","6\" / 300 ppi"],["存储","4 GB"],["防水","无"],["实体翻页键","✓"],["机身","超薄 3.4mm"]], highlight:"首代 Oasis，颠覆性非对称超薄设计" },
  { era:"legacy", series:"scribe", badges:[{label:"已停产",color:"#4a4a4a"}], model:"Kindle Scribe", gen:"第 1 代 · 2022", price:"二手约 ¥1,200–1,600", specs:[["屏幕","10.2\" / 300 ppi"],["存储","16/32/64 GB"],["手写笔","基础笔（需单独购买）"],["防水","无"]], highlight:"首款支持手写笔的 Kindle，开创全新品类" },
  { era:"legacy", series:"basic", badges:[{label:"已停产",color:"#4a4a4a"}], model:"Kindle 基础款", gen:"第 11 代 · 2022", price:"二手约 ¥250–400", specs:[["屏幕","6\" / 300 ppi（首次）"],["存储","16 GB"],["充电","USB-C（首次）"],["防水","无"]], highlight:"基础款首次搭载 300ppi 屏幕与 USB-C" },
  { era:"legacy", series:"basic", badges:[{label:"已停产",color:"#4a4a4a"}], model:"Kindle Voyage", gen:"第 7 代 · 2014", price:"二手约 ¥150–300", specs:[["屏幕","6\" / 300 ppi"],["存储","4 GB"],["特色","压感翻页键 + 自动亮度"],["机身","7.6mm 超薄"]], highlight:"当年最薄 Kindle，压感翻页键设计独特" },
  { era:"legacy", series:"basic", badges:[{label:"年代久远",color:"#4a4a4a"}], model:"Kindle Touch", gen:"第 4 代 · 2011", price:"二手约 ¥50–120", specs:[["屏幕","6\" / 167 ppi"],["存储","4 GB"],["里程碑","首款触控 Kindle"],["防水","无"]], highlight:"触控时代的开端，历史意义大于使用价值" },
];

const COMPARE_ROWS = [
  ["Kindle Colorsoft","7\"","✓","IPX8","✗","✓","✗","32 GB","218g","¥1,499",true],
  ["Kindle Paperwhite SE","7\"","✗","IPX8","✗","✓","✓","32 GB","209g","¥1,058",false],
  ["Kindle Paperwhite","7\"","✗","IPX8","✗","✗","✗","16 GB","209g","¥858",false],
  ["Kindle 基础款","6\"","✗","✗","✗","✗","✗","16 GB","158g","¥558",false],
  ["Kindle Scribe","10.2\"","✗","✗","✓","✗","✗","64 GB","433g","¥2,399",false],
];

const TUTORIALS = [
  { icon:"📤", title:"如何向 Kindle 推送电子书", desc:"Send to Kindle、Calibre、邮件三种方式详解",
    body: `<h4>方法一：Send to Kindle 应用（推荐）</h4><ol><li>在电脑/手机安装 <code>Send to Kindle</code> 官方应用</li><li>登录亚马逊账号</li><li>直接拖拽电子书文件至应用，或右键菜单选择发送</li><li>支持格式：epub、pdf、doc、docx、txt 等</li></ol><div class="tip">💡 epub 格式会自动转换，排版最佳。pdf 建议先用 Calibre 转换后再发送。</div><h4>方法二：邮件发送</h4><ol><li>进入亚马逊 → 账户设置 → 内容与设备 → 首选项 → 个人文档设置</li><li>找到你的 <code>@kindle.cn</code> 邮箱地址</li><li>将发件邮箱加入「已批准的个人文档电子邮件列表」</li><li>以附件形式发送电子书到 Kindle 邮箱即可</li></ol><h4>方法三：USB 直连</h4><ol><li>USB 连接 Kindle 与电脑，Kindle 显示为 U 盘</li><li>打开 <code>documents</code> 文件夹，拖入 mobi/azw3 格式文件</li></ol>` },
  { icon:"📚", title:"Calibre 完整使用教程", desc:"格式转换、书库管理、元数据编辑、自动发送到 Kindle",
    body: `<h4>安装与基础设置</h4><ol><li>前往 <code>calibre-ebook.com</code> 下载对应系统版本</li><li>首次启动选择书库位置，设置设备类型为「Kindle」</li><li>在「首选项 → 通过电子邮件共享书籍」中填写 Kindle 邮箱</li></ol><h4>格式转换（最常用功能）</h4><ol><li>将书籍拖入 Calibre 书库</li><li>右键 → 「转换书籍」→ 输出格式选 <code>AZW3</code> 或 <code>EPUB</code></li><li>在「页面设置」中选择对应 Kindle 型号，优化排版</li><li>中文书建议勾选「添加换行符」</li></ol><div class="tip">💡 中文书转换乱码时，检查源文件编码是否为 UTF-8，可在「输入输出」选项中手动指定。</div><h4>修复封面与元数据</h4><ol><li>右键 → 「编辑元数据」，修改书名、作者、封面</li><li>点击「从互联网下载元数据」可自动填充</li></ol>` },
  { icon:"🔤", title:"自定义字体安装教程", desc:"把霞鹜文楷、思源宋体等中文字体装入 Kindle",
    body: `<h4>操作步骤</h4><ol><li>准备 <code>.ttf</code> 或 <code>.otf</code> 格式字体文件</li><li>USB 连接 Kindle，在根目录新建文件夹 <code>fonts</code>（全小写）</li><li>将字体文件复制进 <code>fonts</code> 文件夹</li><li>安全弹出 Kindle，重启设备</li><li>打开书籍 → 点击 <code>Aa</code> → 字体 → 选择「自定义」</li></ol><div class="tip">💡 固件 5.9.6 以上版本才支持自定义字体。推荐「霞鹜文楷 Kindle 优化版」，专为 e-ink 屏调优，开源免费。</div><h4>推荐字体</h4><ul><li><strong>霞鹜文楷</strong>：开源免费，专为阅读设计，衬线清晰</li><li><strong>思源宋体</strong>：Adobe 出品，正式感强</li><li><strong>方正悠宋</strong>：阅读疲劳感低，适合长时间阅读</li></ul>` },
  { icon:"🔓", title:"Kindle 越狱（Jailbreak）指南", desc:"安装 KOReader、KUAL，适用特定固件版本",
    body: `<div class="tip">⚠️ 越狱可能导致保修失效。请确认固件版本，操作前备份数据。</div><h4>支持的固件版本</h4><ul><li>主流方法适用固件 <code>5.16.2.1.1</code> 及更低版本</li><li>在「设置 → 设备选项 → 设备信息」查看当前固件</li><li>固件 5.17+ 目前无公开越狱方案</li></ul><h4>基本流程</h4><ol><li>前往 MobileRead 论坛下载对应版本越狱包（WatchThis 方法）</li><li>通过 USB 将越狱包复制到 Kindle 根目录</li><li>在 Kindle 搜索框输入特定指令触发越狱</li><li>重启后安装 KUAL（扩展启动器）</li><li>通过 KUAL 安装 KOReader</li></ol><h4>越狱后能做什么</h4><ul><li><strong>KOReader</strong>：支持 epub、cbz 漫画、djvu 等更多格式</li><li><strong>自定义屏保</strong>：替换锁屏广告为自己的图片</li><li><strong>KUAL 插件</strong>：SSH、截图、亮度扩展等</li></ul>` },
  { icon:"🛡️", title:"防止 Kindle 自动更新固件", desc:"锁定固件版本，保留越狱或旧版特性",
    body: `<h4>方法一：伪固件文件（推荐）</h4><ol><li>前往 MobileRead 论坛下载对应型号的伪更新包</li><li>将伪文件放置在 Kindle 根目录</li><li>Kindle 检测到「已安装最新版本」便不再提示更新</li></ol><h4>方法二：保持离线</h4><ul><li>日常使用飞行模式，仅在需同步时短暂开启 Wi-Fi</li><li>简单直接，适合不想折腾的用户</li></ul><div class="tip">💡 即使开启 Wi-Fi，Kindle 也不会强制安装更新。只要不手动点击「立即更新」，固件就不会变化。</div>` },
  { icon:"🖼️", title:"Kindle 看漫画完全指南", desc:"格式选择、分辨率优化、KOReader 漫画模式",
    body: `<h4>推荐格式</h4><ul><li><strong>CBZ</strong>：漫画原生格式，KOReader 完美支持，首选</li><li><strong>EPUB（图片版）</strong>：适合原生 Kindle 系统</li><li><strong>MOBI / AZW3</strong>：用 Calibre 转换，兼容性最广</li></ul><h4>Calibre 漫画转换优化</h4><ol><li>导入 Calibre → 转换为 <code>MOBI</code> 或 <code>AZW3</code></li><li>「页面设置」中选对应 Kindle 型号</li><li>勾选「漫画模式」→「从右到左」（日漫专用）</li><li>关闭「自动添加空白分隔符」</li></ol><div class="tip">💡 看漫画推荐 Kindle Colorsoft（7" 彩色屏）或 Kindle Scribe（10.2" 大屏）。越狱后用 KOReader 效果最佳。</div>` },
  { icon:"📖", title:"PDF 阅读优化技巧", desc:"让 PDF 在 Kindle 上也能好看易读",
    body: `<h4>为什么 PDF 在 Kindle 上体验差？</h4><ul><li>PDF 是固定版式，无法自动调整字体大小</li><li>6" 屏显示 A4 PDF 字体极小，几乎无法阅读</li></ul><h4>方案一：Calibre 转换</h4><ol><li>导入 Calibre → 转换为 AZW3</li><li>在「页面设置」中强制输出字号</li><li>适合纯文字 PDF，图表类排版会乱</li></ol><h4>方案二：K2pdfopt 裁边重排</h4><ol><li>下载 <code>K2pdfopt</code>（专为 e-ink 设备优化）</li><li>选择 Kindle 型号，自动裁去白边并重排文字</li><li>效果远好于 Calibre，学术论文必备工具</li></ol><h4>方案三：Kindle Scribe 原生 PDF</h4><ul><li>10.2" 大屏可直接阅读 A4 PDF 而无需缩放</li><li>支持在 PDF 上手写批注，学术/工作文档最佳方案</li></ul>` },
  { icon:"⚡", title:"延长电池寿命的实用技巧", desc:"设置优化 + 使用习惯，让续航更持久",
    body: `<h4>立竿见影的设置</h4><ul><li><strong>飞行模式</strong>：关闭 Wi-Fi 是最有效的省电方式，可延长续航 2–3 倍</li><li><strong>降低亮度</strong>：亮度控制在 10–15 级即可</li><li><strong>关闭 Goodreads 同步</strong>：设置 → 账户 → 关闭社交功能</li></ul><h4>使用习惯</h4><ul><li>不看书时彻底关闭屏幕，而非仅息屏</li><li>避免频繁快速翻页（e-ink 刷新耗电）</li></ul><h4>电池保养</h4><ul><li>建议保持电量在 40–80%，不要长期满电存放</li><li>使用 5V/1A 充电头，避免快充损伤锂电池</li></ul>` },
  { icon:"🛒", title:"Kindle 二手购买避坑指南", desc:"闲鱼选购要点、验机清单、价格参考",
    body: `<h4>二手哪里买</h4><ul><li><strong>亚马逊官方翻新</strong>：有质保，最安全，约新品七折</li><li><strong>闲鱼</strong>：价格最低，需自行验机</li><li><strong>爱回收 / 咸鱼优选</strong>：有质检，省心但略贵</li></ul><h4>验机清单</h4><ol><li>检查屏幕是否有亮斑、暗角、烧屏痕迹</li><li>确认设备已退出原主亚马逊账号（防止买到「永久绑定」机）</li><li>查看「设置 → 关于」，序列号可在官网验真</li><li>检查充电口是否松动（Micro-USB 老款易损）</li></ol><div class="tip">💡 不建议购买 2021年以前的 Micro-USB 充电老款，日常体验明显落后。</div><h4>2024 年二手价参考</h4><ul><li>Paperwhite 11代（2021）：¥400–600</li><li>Oasis 3代（2019）：¥700–1,000</li><li>Paperwhite 10代（2018）：¥200–300</li></ul>` },
  { icon:"🆚", title:"Kindle vs Kobo vs 实体书怎么选", desc:"三种阅读方式深度对比，找到最适合你的",
    body: `<h4>Kindle 的优势</h4><ul><li>亚马逊书库最大，中文正版内容丰富</li><li>生态完善：Send to Kindle、X-Ray 词典、Whispersync</li><li>各价位选择多，入门款仅 ¥558</li></ul><h4>Kobo 的优势</h4><ul><li>原生支持 epub，无需格式转换</li><li>支持 OverDrive（图书馆借阅系统）</li><li>不依赖亚马逊生态，内容更自由开放</li></ul><h4>实体书的不可替代性</h4><ul><li>无蓝光、无闪烁，视觉疲劳更低</li><li>研究显示实体书阅读记忆效果更好</li><li>收藏价值与馈赠意义</li></ul><h4>推荐结论</h4><ul><li>主要看中文书、购买正版 → <strong>Kindle</strong></li><li>有大量 epub 资源、不依赖亚马逊 → <strong>Kobo</strong></li><li>偏好仪式感阅读、经典收藏 → <strong>实体书</strong></li></ul>` },
];

const QUICK_Q = [
  "预算 1000 元以内，该买哪款 Kindle？",
  "Paperwhite 和 Colorsoft 有什么区别？",
  "如何把 epub 文件发送到 Kindle？",
  "Kindle 看漫画体验怎么样？",
  "Kindle Oasis 停产了，二手还值得买吗？",
  "Kindle 和 Kobo 怎么选？",
];

const SYSTEM_PROMPT = `你是一个专业的 Kindle 百科助手，名叫"Kindle 助手"，运行在"All of Kindle"网站上。

你的知识覆盖：
- Kindle 所有型号规格：基础款（历代）、Paperwhite（1–12代）、Oasis（1–3代）、Voyage、Touch、Scribe（1–2代）、Colorsoft
- 推送电子书：Send to Kindle、邮件推送、USB 直连、Calibre
- 格式转换：epub/mobi/azw3/cbz/pdf 格式与 Calibre 使用
- 自定义字体安装（fonts 文件夹方法，霞鹜文楷等推荐）
- 越狱（Jailbreak）与 KOReader、KUAL 安装
- 防止固件自动更新、漫画阅读优化、PDF 重排（K2pdfopt）
- 电池保养与省电技巧、二手购买选购与验机
- Kindle vs Kobo vs 实体书 对比

回答风格：中文、友好自然、具体实用、适度分段、不过度冗长。`;

// ─── CSS ────────────────────────────────────────────────────────────────────

const globalCSS = `
:root{--ink:#1a1208;--paper:#f5f0e8;--warm:#e8ddc8;--amber:#c8860a;--amber-light:#e8a020;--muted:#8a7a60;--border:#d4c8a8;--white:#fdfaf4;}
*{margin:0;padding:0;box-sizing:border-box;}
html{scroll-behavior:smooth;}
body{font-family:'Noto Serif SC',serif;background:var(--paper);color:var(--ink);overflow-x:hidden;}

/* grain */
body::before{content:'';position:fixed;inset:0;background-image:url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.035'/%3E%3C/svg%3E");pointer-events:none;z-index:9999;opacity:.6;}

/* nav */
.nav{position:sticky;top:0;z-index:200;background:var(--ink);display:flex;align-items:center;justify-content:space-between;padding:0 2.5rem;height:54px;border-bottom:2px solid var(--amber);}
.nav-logo{font-family:'Playfair Display',serif;font-size:1.1rem;color:var(--paper);letter-spacing:.05em;}
.nav-logo em{color:var(--amber);font-style:italic;}
.nav-links{display:flex;gap:1.8rem;}
.nav-links a{font-family:'JetBrains Mono',monospace;font-size:.68rem;color:#b0a080;text-decoration:none;letter-spacing:.12em;text-transform:uppercase;transition:color .2s;cursor:pointer;}
.nav-links a:hover{color:var(--amber-light);}

/* hero */
.hero{background:var(--ink);color:var(--paper);padding:5rem 3rem 4.5rem;position:relative;overflow:hidden;}
.hero::after{content:'📖';position:absolute;right:6%;top:50%;transform:translateY(-50%);font-size:10rem;opacity:.06;pointer-events:none;}
.hero-eyebrow{font-family:'JetBrains Mono',monospace;font-size:.68rem;letter-spacing:.28em;color:var(--amber);text-transform:uppercase;margin-bottom:1.2rem;}
.hero h1{font-family:'Playfair Display',serif;font-size:clamp(2.6rem,6vw,5rem);line-height:1.05;max-width:680px;margin-bottom:1.5rem;}
.hero h1 em{color:var(--amber-light);font-style:italic;}
.hero p{font-size:1rem;color:#a09080;max-width:460px;line-height:1.85;}
.hero-stats{display:flex;gap:2.5rem;margin-top:2.5rem;}
.stat-num{font-family:'Playfair Display',serif;font-size:2rem;color:var(--amber);}
.stat-lbl{font-family:'JetBrains Mono',monospace;font-size:.6rem;letter-spacing:.15em;text-transform:uppercase;color:#6a5a40;margin-top:.2rem;}

/* section */
.section{padding:4rem 3rem;max-width:1140px;margin:0 auto;}
.sec-label{font-family:'JetBrains Mono',monospace;font-size:.65rem;letter-spacing:.25em;text-transform:uppercase;color:var(--amber);margin-bottom:.7rem;}
.sec-title{font-family:'Playfair Display',serif;font-size:1.9rem;margin-bottom:2.5rem;border-bottom:1px solid var(--border);padding-bottom:.8rem;}

/* filter */
.filter-tabs{display:flex;gap:.6rem;margin-bottom:2rem;flex-wrap:wrap;}
.ftab{font-family:'JetBrains Mono',monospace;font-size:.65rem;letter-spacing:.1em;text-transform:uppercase;padding:.4rem 1rem;border:1px solid var(--border);background:transparent;color:var(--muted);cursor:pointer;border-radius:2px;transition:all .2s;}
.ftab:hover,.ftab.active{background:var(--amber);color:var(--ink);border-color:var(--amber);}

/* cards */
.kindle-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(255px,1fr));gap:1.4rem;}
.kindle-card{background:var(--white);border:1px solid var(--border);border-radius:2px;padding:1.8rem 1.6rem;transition:transform .2s,box-shadow .2s,border-color .2s;position:relative;overflow:hidden;}
.kindle-card::before{content:'';position:absolute;top:0;left:0;width:3px;height:0;background:var(--amber);transition:height .25s;}
.kindle-card:hover{transform:translateY(-4px);box-shadow:0 10px 32px rgba(0,0,0,.12);border-color:var(--amber);}
.kindle-card:hover::before{height:100%;}
.card-badge{display:inline-block;font-family:'JetBrains Mono',monospace;font-size:.58rem;padding:.18rem .5rem;color:#fdfaf4;border-radius:2px;letter-spacing:.08em;text-transform:uppercase;margin-bottom:.75rem;margin-right:.3rem;}
.card-model{font-family:'Playfair Display',serif;font-size:1.2rem;margin-bottom:.3rem;}
.card-gen{font-family:'JetBrains Mono',monospace;font-size:.62rem;color:var(--muted);letter-spacing:.1em;margin-bottom:.9rem;text-transform:uppercase;}
.card-price{font-family:'JetBrains Mono',monospace;font-size:1.05rem;color:var(--amber);margin-bottom:1rem;}
.card-specs{list-style:none;}
.card-specs li{font-size:.8rem;color:var(--muted);padding:.2rem 0;border-bottom:1px dashed var(--border);display:flex;justify-content:space-between;}
.card-specs li:last-child{border-bottom:none;}
.card-specs li strong{color:var(--ink);font-weight:600;}
.card-highlight{font-size:.78rem;color:var(--muted);margin-top:.9rem;padding-top:.8rem;border-top:1px solid var(--border);line-height:1.6;}
.card-highlight strong{color:var(--amber);}

/* compare */
.compare-wrap{overflow-x:auto;}
.compare-table{width:100%;border-collapse:collapse;font-size:.8rem;background:var(--white);}
.compare-table th{font-family:'JetBrains Mono',monospace;font-size:.65rem;letter-spacing:.1em;text-transform:uppercase;padding:.85rem .9rem;text-align:left;background:var(--ink);color:var(--paper);border-bottom:2px solid var(--amber);}
.compare-table td{padding:.7rem .9rem;border-bottom:1px solid var(--border);color:var(--muted);}
.compare-table td:first-child{color:var(--ink);font-weight:600;font-family:'Noto Serif SC';}
.compare-table tr:hover td{background:var(--warm);}
.compare-table tr.hl td{background:rgba(200,134,10,.07);}
.chk{color:#2d7a3a;font-weight:bold;}.crs{color:#9a4a3a;}

/* tutorials */
.tut-list{display:grid;gap:.9rem;}
.tut-item{background:var(--white);border:1px solid var(--border);cursor:pointer;transition:border-color .2s;}
.tut-item.open{border-color:var(--amber);}
.tut-header{display:flex;align-items:center;gap:1.2rem;padding:1.2rem 1.5rem;transition:background .2s;}
.tut-item:hover .tut-header,.tut-item.open .tut-header{background:var(--warm);}
.tut-icon{font-size:1.4rem;width:2.2rem;text-align:center;flex-shrink:0;}
.tut-meta{flex:1;}
.tut-title{font-size:.92rem;font-weight:600;margin-bottom:.2rem;}
.tut-desc{font-size:.78rem;color:var(--muted);line-height:1.5;}
.tut-chevron{font-family:'JetBrains Mono',monospace;color:var(--amber);font-size:.9rem;transition:transform .25s;flex-shrink:0;}
.tut-item.open .tut-chevron{transform:rotate(90deg);}
.tut-body{display:none;padding:1rem 1.5rem 1.5rem 4.1rem;font-size:.85rem;line-height:1.85;color:#4a3a20;border-top:1px dashed var(--border);}
.tut-item.open .tut-body{display:block;}
.tut-body h4{font-family:'JetBrains Mono',monospace;font-size:.68rem;letter-spacing:.15em;text-transform:uppercase;color:var(--amber);margin:1rem 0 .5rem;}
.tut-body h4:first-child{margin-top:0;}
.tut-body ol,.tut-body ul{padding-left:1.2rem;margin:.4rem 0;}
.tut-body li{margin:.3rem 0;}
.tut-body code{font-family:'JetBrains Mono',monospace;font-size:.78rem;background:rgba(200,134,10,.1);padding:.1rem .35rem;border-radius:2px;color:var(--amber);}
.tut-body .tip{background:rgba(200,134,10,.08);border-left:3px solid var(--amber);padding:.7rem 1rem;margin:.8rem 0;font-size:.82rem;}
.tut-body strong{color:var(--ink);font-weight:600;}

/* chat section */
.chat-section{background:var(--ink);padding:4.5rem 0;}
.chat-wrapper{max-width:780px;margin:0 auto;padding:0 2rem;}
.chat-sec-label{font-family:'JetBrains Mono',monospace;font-size:.65rem;letter-spacing:.25em;text-transform:uppercase;color:var(--amber);margin-bottom:.7rem;}
.chat-sec-title{font-family:'Playfair Display',serif;font-size:1.75rem;color:var(--paper);border-bottom:1px solid #2a2010;padding-bottom:.8rem;margin-bottom:.8rem;}
.chat-sec-sub{color:#7a6a50;font-size:.86rem;line-height:1.75;margin-bottom:1.5rem;}
.quick-row{display:flex;flex-wrap:wrap;gap:.6rem;margin-bottom:1.2rem;}
.quick-btn{font-family:'JetBrains Mono',monospace;font-size:.63rem;padding:.38rem .8rem;background:transparent;border:1px solid #3a3020;color:#7a6a50;cursor:pointer;border-radius:2px;letter-spacing:.05em;transition:all .2s;}
.quick-btn:hover{border-color:var(--amber);color:var(--amber-light);}
.chat-box{background:#f9f5ec;border:1px solid var(--border);border-radius:2px;height:440px;overflow-y:auto;padding:1.5rem;display:flex;flex-direction:column;gap:1rem;scroll-behavior:smooth;}
.chat-box::-webkit-scrollbar{width:4px;}
.chat-box::-webkit-scrollbar-thumb{background:var(--amber);border-radius:2px;}
.msg{display:flex;gap:.75rem;align-items:flex-start;animation:msgIn .3s ease;}
@keyframes msgIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}
.msg.user{flex-direction:row-reverse;}
.msg-av{width:30px;height:30px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:.72rem;flex-shrink:0;font-family:'JetBrains Mono',monospace;}
.msg.ai .msg-av{background:var(--amber);color:var(--ink);}
.msg.user .msg-av{background:var(--ink);color:var(--amber);border:1px solid var(--amber);}
.msg-bubble{max-width:80%;padding:.85rem 1.1rem;font-size:.86rem;line-height:1.8;border-radius:2px;}
.msg.ai .msg-bubble{background:var(--white);border:1px solid var(--border);color:var(--ink);}
.msg.user .msg-bubble{background:#2a2010;color:var(--paper);border:1px solid #3a3020;}
.msg-bubble code{font-family:'JetBrains Mono',monospace;font-size:.76rem;background:rgba(200,134,10,.15);padding:.1rem .3rem;border-radius:2px;color:var(--amber);}
.msg-bubble strong{color:var(--amber);}
.dots{display:flex;gap:4px;padding:3px 0;}
.dot{width:6px;height:6px;border-radius:50%;background:var(--amber);animation:bounce 1.2s ease infinite;}
.dot:nth-child(2){animation-delay:.2s;}.dot:nth-child(3){animation-delay:.4s;}
@keyframes bounce{0%,60%,100%{transform:translateY(0)}30%{transform:translateY(-6px)}}
.chat-input-row{display:flex;gap:.8rem;margin-top:1rem;}
.chat-input{flex:1;background:#1e1808;border:1px solid #3a3020;color:var(--paper);padding:.85rem 1.1rem;font-family:'Noto Serif SC',serif;font-size:.86rem;border-radius:2px;outline:none;transition:border-color .2s;}
.chat-input:focus{border-color:var(--amber);}
.chat-input::placeholder{color:#4a3a20;}
.chat-send{background:var(--amber);color:var(--ink);border:none;padding:.85rem 1.5rem;font-family:'JetBrains Mono',monospace;font-size:.78rem;letter-spacing:.08em;text-transform:uppercase;cursor:pointer;border-radius:2px;transition:background .2s;font-weight:600;}
.chat-send:hover{background:var(--amber-light);}
.chat-send:disabled{opacity:.45;cursor:not-allowed;}

/* footer */
.footer{background:var(--ink);border-top:1px solid #1e1808;padding:2rem 3rem;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:.8rem;}
.footer p{font-family:'JetBrains Mono',monospace;font-size:.62rem;color:#3a2a10;letter-spacing:.08em;}
.footer p span{color:var(--amber);}

@media(max-width:640px){
  .nav{padding:0 1rem;}.nav-links{gap:1rem;}
  .hero,.section{padding:2.5rem 1.2rem;}.hero h1{font-size:2.1rem;}.hero-stats{gap:1.5rem;}
  .footer{padding:1.5rem 1.2rem;flex-direction:column;}
  .tut-body{padding-left:1.5rem;}
}
`;

// ─── HELPERS ─────────────────────────────────────────────────────────────────

function fmtMsg(text) {
  return text
    .replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;")
    .replace(/\*\*(.*?)\*\*/g,"<strong>$1</strong>")
    .replace(/`(.*?)`/g,"<code>$1</code>")
    .replace(/\n/g,"<br>");
}

// ─── SUB-COMPONENTS ──────────────────────────────────────────────────────────

function ModelCard({ m }) {
  return (
    <div className="kindle-card">
      <div>{m.badges.map(b=>(
        <span key={b.label} className="card-badge" style={{background:b.color}}>{b.label}</span>
      ))}</div>
      <div className="card-model">{m.model}</div>
      <div className="card-gen">{m.gen}</div>
      <div className="card-price">{m.price}</div>
      <ul className="card-specs">
        {m.specs.map(([k,v])=>(
          <li key={k}><span>{k}</span><strong>{v}</strong></li>
        ))}
      </ul>
      <div className="card-highlight">✦ <strong>最适合</strong>：{m.highlight}</div>
    </div>
  );
}

function TutorialItem({ t }) {
  const [open, setOpen] = useState(false);
  return (
    <div className={`tut-item${open?" open":""}`} onClick={()=>setOpen(!open)}>
      <div className="tut-header">
        <div className="tut-icon">{t.icon}</div>
        <div className="tut-meta">
          <div className="tut-title">{t.title}</div>
          <div className="tut-desc">{t.desc}</div>
        </div>
        <div className="tut-chevron">→</div>
      </div>
      <div className="tut-body" dangerouslySetInnerHTML={{__html:t.body}} />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 替换 page.jsx 中原来的 ChatSection 函数（第 263–363 行）
// 其余代码（MODELS、COMPARE_ROWS、TUTORIALS、QUICK_Q、SYSTEM_PROMPT、
// globalCSS、fmtMsg、ModelCard、TutorialItem、App）全部保持不变
// ─────────────────────────────────────────────────────────────────────────────

// 新增 CSS（追加到 globalCSS 字符串末尾，在最后的反引号之前粘贴）
// ─────────────────────────────────────────────────────────────────────────────
/*
.profile-bar{display:flex;align-items:center;gap:.6rem;margin-bottom:.9rem;flex-wrap:wrap;}
.profile-tag{font-family:'JetBrains Mono',monospace;font-size:.58rem;letter-spacing:.06em;padding:.2rem .55rem;border:1px solid #3a3020;color:#8a7a50;border-radius:2px;background:transparent;}
.profile-tag.active{border-color:var(--amber);color:var(--amber);}
.source-badge{font-family:'JetBrains Mono',monospace;font-size:.56rem;letter-spacing:.06em;padding:.1rem .4rem;border-radius:2px;display:inline-block;margin-top:.4rem;}
.source-badge.local{background:rgba(45,122,58,.15);color:#2d7a3a;border:1px solid rgba(45,122,58,.3);}
.source-badge.deepseek{background:rgba(200,134,10,.1);color:var(--amber);border:1px solid rgba(200,134,10,.25);}
.memory-hint{font-family:'JetBrains Mono',monospace;font-size:.58rem;color:#4a3a20;letter-spacing:.05em;padding:.5rem 0 .2rem;text-align:center;opacity:.6;}
*/
// ─────────────────────────────────────────────────────────────────────────────

function ChatSection() {
  const [msgs, setMsgs] = useState([
    { role: "ai", html: "你好！我是 <strong>Kindle 助手</strong>，专门解答关于 Kindle 的一切问题 📖<br><br>型号选购、格式推送、字体安装、越狱教程、故障排查……都可以问我～<br><br><em style='color:var(--amber);font-size:.8rem;font-style:normal'>💡 我会记住你的偏好，越聊越懂你的需求。</em>" }
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [history, setHistory] = useState([]);
  // 用户画像状态（从 API 返回值实时更新）
  const [profile, setProfile] = useState(null);
  const boxRef = useRef(null);

  // ── visitorId：优先使用 crypto.randomUUID，降级用时间戳 ──
  function getVisitorId() {
    if (typeof window === "undefined") return "";
    let id = localStorage.getItem("all_of_kindle_visitor_id");
    if (!id) {
      id = crypto.randomUUID?.() || `visitor_${Date.now()}_${Math.random().toString(36).slice(2)}`;
      localStorage.setItem("all_of_kindle_visitor_id", id);
    }
    return id;
  }

  useEffect(() => {
    if (boxRef.current) boxRef.current.scrollTop = boxRef.current.scrollHeight;
  }, [msgs, loading]);

  async function send(text) {
    const q = (text || input).trim();
    if (!q || loading) return;
    setInput("");
    setMsgs(m => [...m, { role: "user", html: fmtMsg(q) }]);
    const nh = [...history, { role: "user", content: q }];
    setHistory(nh);
    setLoading(true);

    try {
      const visitorId = getVisitorId();

      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ visitorId, messages: nh }),
      });

      const data = await res.json();
      const reply = data.reply || "未收到有效回复";
      const source = data.source || "deepseek"; // "local" | "deepseek"

      // 更新画像状态
      if (data.profile) setProfile(data.profile);

      // 在消息气泡底部附加来源标签
      const sourceBadge = source === "local"
        ? `<span class="source-badge local">📚 本地知识库</span>`
        : `<span class="source-badge deepseek">✦ DeepSeek AI</span>`;

      setMsgs(m => [...m, { role: "ai", html: fmtMsg(reply) + "<br>" + sourceBadge }]);
      setHistory(h => [...h, { role: "assistant", content: reply }]);
    } catch (e) {
      setMsgs(m => [...m, { role: "ai", html: `请求失败：${e.message}` }]);
    }

    setLoading(false);
  }

  // ── 画像标签渲染（显示在输入框上方）──────────────────────
  function renderProfileTags() {
    if (!profile || profile.messageCount < 2) return null;

    const tags = [];

    if (profile.budget) {
      const label = { low: "💰 入门预算", mid: "💳 中等预算", high: "💎 高端预算" };
      tags.push(label[profile.budget]);
    }

    const useCaseMap = { manga: "🎨 看漫画", notes: "✏️ 做笔记", pdf: "📄 看PDF", reading: "📖 纯阅读", study: "🎓 学习备考" };
    profile.useCase?.slice(0, 2).forEach(u => {
      if (useCaseMap[u]) tags.push(useCaseMap[u]);
    });

    if (profile.needWaterproof) tags.push("💧 防水");
    if (profile.needColor) tags.push("🌈 彩色屏");
    if (profile.needStylus) tags.push("🖊️ 手写笔");

    if (tags.length === 0) return null;

    return (
      <div className="profile-bar">
        <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: ".56rem", color: "#4a3a20", letterSpacing: ".08em" }}>
          我的偏好：
        </span>
        {tags.map((t, i) => (
          <span key={i} className="profile-tag active">{t}</span>
        ))}
        {/* 清除画像按钮 */}
        <button
          onClick={clearProfile}
          title="清除记忆，重新开始"
          style={{
            marginLeft: "auto", fontFamily: "'JetBrains Mono',monospace", fontSize: ".55rem",
            background: "transparent", border: "1px solid #2a2010", color: "#4a3a20",
            padding: ".15rem .45rem", cursor: "pointer", borderRadius: "2px",
          }}
        >
          ✕ 清除记忆
        </button>
      </div>
    );
  }

  // ── 清除用户画像（仅删除本地 ID，服务端记录自然失效）──────
  function clearProfile() {
    if (!confirm("确认清除对话记忆？下次对话将重新开始。")) return;
    localStorage.removeItem("all_of_kindle_visitor_id");
    setProfile(null);
    setHistory([]);
    setMsgs([{
      role: "ai",
      html: "记忆已清除 🗑️<br>你好，我是 <strong>Kindle 助手</strong>，请问有什么想了解的？"
    }]);
  }

  return (
    <section className="chat-section" id="chat-section">
      <div className="chat-wrapper">
        <div className="chat-sec-label">// AI 智能问答</div>
        <div className="chat-sec-title">问问 Kindle 助手</div>
        <div className="chat-sec-sub">
          由 DeepSeek AI 驱动，支持型号选购、使用教程、越狱指南、故障排查等所有 Kindle 相关问题。
          {profile && profile.messageCount > 1 && (
            <span style={{ color: "var(--amber)", fontSize: ".8rem", marginLeft: ".5rem" }}>
              （已记住你的 {profile.messageCount} 条对话偏好）
            </span>
          )}
        </div>

        {/* 快捷问题 */}
        <div className="quick-row">
          {QUICK_Q.map(q => (
            <button key={q} className="quick-btn" onClick={() => send(q)}>
              {q.length > 16 ? q.slice(0, 16) + "…" : q}
            </button>
          ))}
        </div>

        {/* 消息区域 */}
        <div className="chat-box" ref={boxRef}>
          {msgs.map((m, i) => (
            <div key={i} className={`msg ${m.role}`}>
              <div className="msg-av">{m.role === "ai" ? "K" : "U"}</div>
              <div className="msg-bubble" dangerouslySetInnerHTML={{ __html: m.html }} />
            </div>
          ))}
          {loading && (
            <div className="msg ai">
              <div className="msg-av">K</div>
              <div className="msg-bubble">
                <div className="dots">
                  <div className="dot" /><div className="dot" /><div className="dot" />
                </div>
              </div>
            </div>
          )}
          {/* 历史消息超过3条时，显示记忆提示 */}
          {history.length > 5 && (
            <div className="memory-hint">
              ↑ 助手已记住本次对话中的偏好，推荐结果将越来越精准
            </div>
          )}
        </div>

        {/* 用户画像标签栏（有画像才显示） */}
        {renderProfileTags()}

        {/* 输入区域 */}
        <div className="chat-input-row">
          <input
            className="chat-input"
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === "Enter" && send()}
            placeholder="输入你的 Kindle 问题……按 Enter 发送"
            disabled={loading}
          />
          <button className="chat-send" onClick={() => send()} disabled={loading}>
            发送
          </button>
        </div>
      </div>
    </section>
  );
}

// ─── MAIN ────────────────────────────────────────────────────────────────────

export default function App() {
  const [filter, setFilter] = useState("all");

  useEffect(() => {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = "https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,700;1,400&family=Noto+Serif+SC:wght@300;400;600&family=JetBrains+Mono:wght@300;400&display=swap";
    document.head.appendChild(link);
  }, []);

  const filtered = MODELS.filter(m=>{
    if(filter==="all") return true;
    if(filter==="current") return m.era==="current";
    if(filter==="legacy") return m.era==="legacy";
    return m.series===filter;
  });

  const FILTERS = [
    {key:"all",label:"全部"},
    {key:"current",label:"在售型号"},
    {key:"paperwhite",label:"Paperwhite"},
    {key:"oasis",label:"Oasis"},
    {key:"scribe",label:"Scribe"},
    {key:"legacy",label:"历代经典"},
  ];

  function scrollTo(id){ document.getElementById(id)?.scrollIntoView({behavior:"smooth"}); }

  return (
    <>
      <style>{globalCSS}</style>

      {/* NAV */}
      <nav className="nav">
        <div className="nav-logo">All of <em>Kindle</em></div>
        <div className="nav-links">
          <a onClick={()=>scrollTo("models")}>型号</a>
          <a onClick={()=>scrollTo("compare")}>对比</a>
          <a onClick={()=>scrollTo("tutorials")}>教程</a>
          <a onClick={()=>scrollTo("chat-section")}>AI 问答</a>
        </div>
      </nav>

      {/* HERO */}
      <section className="hero">
        <div className="hero-eyebrow">The Complete Reference · 中文版</div>
        <h1>一切关于<br/><em>Kindle</em></h1>
        <p>收录历代型号完整数据库，配套深度使用教程与选购指南，内置 AI 助手随时解答你的问题。</p>
        <div className="hero-stats">
          <div><div className="stat-num">15+</div><div className="stat-lbl">收录型号</div></div>
          <div><div className="stat-num">10</div><div className="stat-lbl">深度教程</div></div>
          <div><div className="stat-num">AI</div><div className="stat-lbl">智能问答</div></div>
        </div>
      </section>

      {/* MODELS */}
      <div id="models">
        <div className="section">
          <div className="sec-label">// 型号数据库</div>
          <h2 className="sec-title">Kindle 全系列型号</h2>
          <div className="filter-tabs">
            {FILTERS.map(f=>(
              <button key={f.key} className={`ftab${filter===f.key?" active":""}`} onClick={()=>setFilter(f.key)}>{f.label}</button>
            ))}
          </div>
          <div className="kindle-grid">
            {filtered.map((m,i)=><ModelCard key={i} m={m}/>)}
          </div>
        </div>
      </div>

      {/* COMPARE */}
      <div id="compare">
        <div className="section" style={{paddingTop:0}}>
          <div className="sec-label">// 横向对比</div>
          <h2 className="sec-title">2024 在售型号核心参数</h2>
          <div className="compare-wrap">
            <table className="compare-table">
              <thead>
                <tr>{["型号","屏幕","彩色","防水","手写","色温调节","无线充","存储上限","重量","价格起"].map(h=><th key={h}>{h}</th>)}</tr>
              </thead>
              <tbody>
                {COMPARE_ROWS.map(([name,sc,color,waterp,write,temp,wireless,storage,wt,price,hl])=>(
                  <tr key={name} className={hl?"hl":""}>
                    <td>{name}</td><td>{sc}</td>
                    <td>{color==="✓"?<span className="chk">✓</span>:<span className="crs">✗</span>}</td>
                    <td>{waterp==="✗"?<span className="crs">✗</span>:<span className="chk">{waterp}</span>}</td>
                    <td>{write==="✓"?<span className="chk">✓</span>:<span className="crs">✗</span>}</td>
                    <td>{temp==="✓"?<span className="chk">✓</span>:<span className="crs">✗</span>}</td>
                    <td>{wireless==="✓"?<span className="chk">✓</span>:<span className="crs">✗</span>}</td>
                    <td>{storage}</td><td>{wt}</td><td>{price}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* TUTORIALS */}
      <div id="tutorials">
        <div className="section">
          <div className="sec-label">// 使用指南</div>
          <h2 className="sec-title">深度教程（点击展开）</h2>
          <div className="tut-list">
            {TUTORIALS.map((t,i)=><TutorialItem key={i} t={t}/>)}
          </div>
        </div>
      </div>

      {/* AI CHAT */}
      <ChatSection/>

      {/* FOOTER */}
      <footer className="footer">
        <p>© 2025 <span>All of Kindle</span> — 非官方独立参考站，与亚马逊无关联</p>
        <p>AI 问答由 <span>Claude (Anthropic)</span> 驱动 · 数据仅供参考，请以官网为准</p>
      </footer>
    </>
  );
}

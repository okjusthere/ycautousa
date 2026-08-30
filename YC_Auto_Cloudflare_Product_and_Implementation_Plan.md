# YC Auto 全 Cloudflare 二手车官网与库存系统方案

**项目名称：** YC Auto Dealer Website & Inventory Platform  
**目标域名：** `www.ycautousa.com`  
**目标版本：** Production v1  
**原则：** Cloudflare 作为完整核心基础设施；外部 API 仅允许免费、无需信用卡、低复杂度、非关键依赖且可降级的公共 API；前台现代化、后台极简、数据可迁移、系统可长期维护。

---

## 1. 执行结论

该项目应被定义为：

> 一个面向小型独立二手车商的定制官网，加一个轻量级库存与询盘管理后台。

它不是 DMS，不做财务、F&I、DMV、合同、贷款审批或第三方平台同步。v1 只解决四件事：

1. 客户能够快速找到并查看车辆；
2. 管理员能够非常简单地录入、修改、上下架车辆；
3. 所有车辆图片、库存和询盘都掌握在自己的 Cloudflare 环境中；
4. 旧网站公开库存、图片和旧 URL 尽可能完整迁移，并保留 SEO。

推荐使用单一代码库、单一 Cloudflare Worker、单一 D1 数据库和单一 R2 bucket。不要拆微服务，不要引入 Supabase、Vercel、Resend、Clerk、Firebase、Auth0、UploadThing、Google Analytics 或其他付费/关键运行时 SaaS 依赖。允许符合本方案免费 API 规则的公共 API；Production v1 当前仅批准 NHTSA vPIC 用于 VIN Smart Fill。

---

## 2. 已确认的旧站情况

截至方案编写时，旧站公开库存页共有 4 页，页面上合计约 35 条车辆记录。每辆车有独立详情页，常见字段包括：

- 标题；
- Category / Make；
- VIN；
- Mileage；
- Price；
- Color；
- Drivetrain；
- Transmission；
- Description；
- 多张车辆图片。

旧站数据并不完全规范，例如存在 VIN 为空、品牌拼写不统一、描述过短、标题大小写混乱等情况。因此迁移不能简单复制，必须包含规范化和审计报告。

公开页面底部显示 `xiaoyucms`，页面结构更像模板 CMS，而不是标准 Wix。对迁移反而是有利的：库存页和详情页是可抓取的静态 HTML，图片也有公开 URL。

旧站可作为迁移默认值的公开信息：

- Business name: Your Choice Auto Group LLC；
- Phone: 718-799-0606；
- Email: sophie@youxuancars.com；
- Address: 167-04 Northern Blvd., Flushing, NY 11358。

这些信息应在新后台的 Website Settings 中可编辑。旧站的 WhatsApp、QQ、二维码、团队成员、新闻、保修承诺等内容不得未经确认直接迁移。

---

## 3. 严格技术边界

### 3.1 允许的运行时组件

| 层级                    | 方案                                         |
| ----------------------- | -------------------------------------------- |
| Full-stack framework    | React Router v8 + TypeScript                 |
| Runtime                 | Cloudflare Workers                           |
| Static assets           | Workers Assets                               |
| Database                | Cloudflare D1                                |
| Vehicle images          | Cloudflare R2                                |
| Image resizing          | Cloudflare Images binding                    |
| Admin authentication    | Cloudflare Access                            |
| Form anti-spam          | Cloudflare Turnstile                         |
| Lead notification email | Cloudflare Email Service                     |
| Traffic analytics       | Cloudflare Web Analytics                     |
| DNS / SSL / CDN         | Cloudflare                                   |
| Deployment              | Wrangler CLI                                 |
| Styling                 | Tailwind CSS + locally bundled UI components |
| Validation              | Zod                                          |
| Tests                   | Vitest + Playwright                          |

开源 npm package 可以使用，它们是代码依赖，不是外部运行时服务。

### 3.2 明确禁止

- Vercel；
- Netlify；
- Supabase；
- Firebase；
- PlanetScale；
- Neon；
- AWS S3；
- Clerk / Auth0 / NextAuth；
- Resend / SendGrid / Mailgun；
- Cloudinary / UploadThing；
- Algolia；
- Google Analytics；
- Google Maps API；
- 商业或收费 VIN decoder；
- 任何要求付费套餐、信用卡、强平台绑定或成为核心业务单点依赖的外部 SaaS API；
- 未经本方案明确批准的外部 API 不得由 Codex 自行加入。

### 3.3 免费外部 API 使用规则

系统仍以 Cloudflare 为完整核心基础设施。免费公共 API 只有同时满足以下条件才可以进入 v1：

1. 对当前使用场景永久免费，不要求付费套餐或信用卡；
2. 最好无需 API key / OAuth / 开发者账号；
3. Worker 端一次简单 HTTP 请求即可集成，不引入 SDK、后台任务或复杂同步；
4. API 失败不能阻止录车、编辑、发布、浏览库存或提交询盘；
5. 设置短 timeout，并提供明确的 graceful fallback；
6. 对可缓存数据写入 D1，避免重复请求；
7. 管理员始终可以手工覆盖 API 返回值；
8. 不向外部 API 发送客户姓名、电话、邮箱、询盘内容等 PII；
9. 必须在文档中记录 API 来源、使用字段、失败行为和移除方式。

Production v1 **仅批准 NHTSA vPIC**。不要因为“免费”就额外接入地图、估价、Carfax 替代品、AI、车辆图片、短信或其他服务。NHTSA Recalls 等免费政府 API 可以以后单独评估，但不属于 v1。

### 3.4 VIN Smart Fill：NHTSA vPIC

恢复 VIN 自动填充，但把它设计成**便利功能，不是关键依赖**。NHTSA vPIC 是美国政府公开车辆数据 API，可免费使用且无需注册。

管理员录车时：

```text
VIN
[ 5TDKSKFC9PS080194 ] [ Decode VIN ]
```

流程：

```text
Validate VIN locally
      ↓
Check D1 vin_decode_cache
      ↓ cache miss
Cloudflare Worker → NHTSA vPIC
      ↓
Normalize useful fields
      ↓
Cache result in D1
      ↓
Fill blank vehicle fields
```

建议使用 vPIC `DecodeVinValues` JSON endpoint，由 Worker 服务端调用，不在浏览器直接调用。

优先映射：

- `ModelYear` → year；
- `Make` → make；
- `Model` → model；
- `Trim` → trim（有可靠值时）；
- `BodyClass` → body type；
- `DriveType` → drivetrain；
- `TransmissionStyle` → transmission；
- `FuelTypePrimary` → fuel type；
- `DisplacementL` / `EngineModel` / `EngineCylinders` → engine 的辅助信息。

交互要求：

- VIN 仍允许为空，以兼容旧库存；
- 输入 VIN 时先做 17 位、I/O/Q、重复 VIN 校验；
- 只有合法 VIN 才允许 Decode；
- API 只填充空字段，不能静默覆盖管理员已输入内容；
- 如需覆盖已有字段，必须由管理员确认；
- 所有自动填字段都可手工修改；
- NHTSA 没有返回的字段保持为空；
- 不把不确定的 trim/options 猜出来；
- API timeout、限流或不可用时显示 `VIN auto-fill unavailable — enter details manually`，但不得阻止保存或发布；
- 同一 VIN 优先读取 D1 cache，避免重复调用；
- 测试环境使用 mock，不让测试套件依赖 NHTSA 在线状态。

---

## 4. 信息架构

### 4.1 公开网站

```text
/
/inventory
/inventory/:slug
/about
/contact
/privacy
/terms
/sitemap.xml
/robots.txt
/media/:key
/api/leads
/api/track
```

### 4.2 管理后台

```text
/admin
/admin/vehicles
/admin/vehicles/new
/admin/vehicles/:id
/admin/leads
/admin/settings
/admin/audit
/api/admin/vin/decode
```

后台和后台写接口必须同时受到以下保护：

1. Cloudflare Access；
2. Worker 内部再次检查 Access identity；
3. 精确管理员邮箱 allowlist；
4. 所有写操作进行 same-origin 校验；
5. 所有输入使用 Zod 服务器端验证。

---

## 5. 前台产品设计

### 5.1 视觉方向

目标是现代、克制、可信，不做传统模板车行网站。

建议设计语言：

- 黑色或深石墨色导航；
- 白色主背景；
- 红色作为 CTA 强调色；
- 大面积车辆图片；
- 清晰价格、里程和状态；
- 圆角适度，不做过度 SaaS 化；
- 不使用假评价、假团队、假新闻或未经确认的保修承诺。

默认使用 CSS/SVG 生成清晰的 `YC AUTO USA` 字标。若迁移到的旧 logo 清晰度不足，不直接复用低分辨率图片。

### 5.2 首页

首页顺序：

1. Header：Logo、Inventory、About、Contact、Call；
2. Hero：标题、简短说明、库存搜索；
3. Featured Vehicles；
4. Browse by Make，自动从在售库存生成品牌及数量；
5. Why Choose YC Auto，内容必须中性并可后台编辑；
6. 简短联系模块；
7. Footer：电话、邮箱、地址、Privacy、Terms。

Hero 默认文案可使用：

```text
Find Your Next Car
Quality pre-owned vehicles in Flushing, New York.
```

### 5.3 Inventory 页面

筛选项：

- Make；
- Model；
- Year range；
- Price range；
- Maximum mileage；
- Body type；
- Drivetrain。

排序：

- Newest added；
- Price low to high；
- Price high to low；
- Mileage low to high；
- Year newest。

要求：

- URL query string 保存筛选状态；
- 移动端筛选使用 bottom sheet；
- 每页 12 或 24 台；
- 无结果时给出 Clear filters；
- Card 显示封面、年份/品牌/车型/trim、价格、里程和状态；
- 图片必须保持统一比例，不能 layout shift。

### 5.4 Vehicle Detail 页面

必须包含：

- 大图 Gallery；
- 移动端可左右滑动；
- 标题；
- 价格；
- 里程；
- VIN（旁边提供 `Decode VIN` / Smart Fill）；
- Stock number；
- Specs；
- Description；
- Features；
- Call、Text、Check Availability、Schedule Test Drive；
- 相似在售车辆；
- Sold / Pending 明显状态；
- 移动端 sticky CTA bar。

状态规则：

- `available`：正常展示和询盘；
- `pending`：展示 Pending，不隐藏；
- `sold`：保留页面和 SEO，显示 Sold，并推荐相似库存；
- `draft`：公开不可访问；
- `hidden`：公开不可访问。

### 5.5 About / Contact

About 不复制旧站模板文本。使用简短、可编辑、可核实的公司介绍。

Contact 表单字段只保留：

- Name；
- Phone；
- Email；
- Preferred contact method；
- Message。

Vehicle Detail 发起表单时自动关联车辆，不再出现 Order Quantity、Fax、Country 等无关字段。

---

## 6. 后台产品设计

### 6.1 Dashboard

只显示有用信息：

- Available；
- Pending；
- Sold；
- Draft；
- New leads；
- 最近车辆；
- 最近询盘；
- `Add Vehicle` 主按钮。

不要制作复杂图表。

### 6.2 Inventory 管理

列表支持：

- 搜索 title、VIN、stock number；
- 状态筛选；
- Make 筛选；
- 快速编辑 price / mileage / status；
- Duplicate；
- Edit；
- Preview；
- Mark pending；
- Mark sold；
- Hide；
- 批量状态修改。

默认不提供永久删除车辆。需要删除时采用 soft delete，并保留审计记录。

### 6.3 Add/Edit Vehicle

采用一个清晰的单页表单，而不是复杂多步 wizard。

分区：

1. Basic Information；
2. Pricing and Mileage；
3. Specifications；
4. Description and Features；
5. Photos；
6. Publishing。

核心字段：

- Status；
- Featured；
- Title；
- Year；
- Make；
- Model；
- Trim；
- VIN（旁边提供 `Decode VIN` / Smart Fill）；
- Stock number；
- Price；
- Mileage；
- Exterior color；
- Interior color；
- Body type；
- Drivetrain；
- Transmission；
- Fuel type；
- Engine；
- Description；
- Features。

VIN Smart Fill 的交互必须保持简单：合法 17 位 VIN 出现 `Decode VIN` 按钮；点击后显示轻量 loading，成功后只补齐空字段，并标注 `Auto-filled from NHTSA`。失败时保持当前表单内容不变。

按钮只保留：

- Save Draft；
- Publish / Update；
- Preview；
- Cancel。

### 6.4 图片管理

这是后台最重要的体验之一。

要求：

- 拖拽或多选上传；
- 一次可选择多张；
- 浏览器端先压缩，最长边 2560px；
- 上传逐张进行，显示进度；
- 失败可单张重试；
- 拖拽排序；
- Set Cover；
- 删除确认；
- 自动生成 alt text；
- 允许 JPEG、PNG、WebP；
- 服务器必须验证 MIME、文件大小和真实图片格式；
- R2 bucket 保持 private，通过 Worker 输出。

R2 key 使用不可变唯一 key，不覆盖原 key：

```text
vehicles/{vehicle_id}/{image_id}/original.webp
```

图片读取路由只允许固定宽度，例如：

```text
320, 640, 960, 1280, 1600, 2048
```

使用 Images binding 输出 WebP/AVIF/JPEG，并设置长期缓存。

### 6.5 Leads

字段：

- Lead type；
- Vehicle；
- Name；
- Phone；
- Email；
- Preferred contact；
- Message；
- Status；
- Source URL；
- Referrer；
- UTM；
- Country；
- Created at；
- Admin notes。

状态：

```text
new -> contacted -> qualified -> closed
                         \-> spam
```

Lead 必须先写入 D1，再发送邮件。Cloudflare Email Service 发送失败不能导致 lead 丢失。

### 6.6 Settings

管理员可以编辑：

- Business name；
- Short name；
- Phone；
- SMS number；
- Email；
- Address；
- Business hours；
- Hero title / subtitle；
- About text；
- Lead notification recipient；
- SEO title / description；
- Optional WhatsApp number；
- Logo / favicon。

---

## 7. 数据库设计

### 7.1 `vehicles`

```text
id TEXT PRIMARY KEY
slug TEXT UNIQUE NOT NULL
status TEXT NOT NULL
featured INTEGER NOT NULL DEFAULT 0
title TEXT NOT NULL
year INTEGER
make TEXT
model TEXT
trim TEXT
vin TEXT UNIQUE
stock_number TEXT
price_cents INTEGER
mileage INTEGER
exterior_color TEXT
interior_color TEXT
body_type TEXT
drivetrain TEXT
transmission TEXT
fuel_type TEXT
engine TEXT
description TEXT
features_json TEXT
legacy_url TEXT UNIQUE
created_at TEXT NOT NULL
updated_at TEXT NOT NULL
published_at TEXT
sold_at TEXT
deleted_at TEXT
```

VIN 允许 NULL。SQLite 中多个 NULL 不违反 unique 约束。

### 7.2 `vin_decode_cache`

```text
vin TEXT PRIMARY KEY
source TEXT NOT NULL DEFAULT 'nhtsa_vpic'
normalized_json TEXT NOT NULL
raw_json TEXT
fetched_at TEXT NOT NULL
last_used_at TEXT NOT NULL
```

该表仅缓存车辆解码结果，不保存客户信息。缓存是性能优化，不是系统正确性的前提；NHTSA 不可用时车辆仍可完全手工录入。

### 7.3 `vehicle_images`

```text
id TEXT PRIMARY KEY
vehicle_id TEXT NOT NULL
r2_key TEXT UNIQUE NOT NULL
original_filename TEXT
content_type TEXT
byte_size INTEGER
width INTEGER
height INTEGER
position INTEGER NOT NULL
is_cover INTEGER NOT NULL DEFAULT 0
created_at TEXT NOT NULL
deleted_at TEXT
```

### 7.4 `leads`

```text
id TEXT PRIMARY KEY
vehicle_id TEXT
lead_type TEXT NOT NULL
name TEXT NOT NULL
phone TEXT
email TEXT
preferred_contact TEXT
message TEXT
status TEXT NOT NULL DEFAULT 'new'
source_url TEXT
referrer TEXT
utm_json TEXT
cf_country TEXT
ip_hash TEXT
admin_notes TEXT
email_status TEXT
created_at TEXT NOT NULL
updated_at TEXT NOT NULL
```

不保存原始 IP。需要防滥用时，对 IP 加 secret salt 后哈希。

### 7.5 `site_settings`

采用单行 typed settings table，不使用失控的任意 key-value CMS。

### 7.6 `legacy_redirects`

```text
old_path TEXT PRIMARY KEY
target_path TEXT NOT NULL
status_code INTEGER NOT NULL DEFAULT 301
created_at TEXT NOT NULL
```

### 7.7 `audit_logs`

```text
id TEXT PRIMARY KEY
admin_email TEXT NOT NULL
action TEXT NOT NULL
entity_type TEXT NOT NULL
entity_id TEXT
details_json TEXT
created_at TEXT NOT NULL
```

### 7.8 `analytics_daily`

只记录业务转化事件，不替代 Cloudflare Web Analytics：

```text
date TEXT
event_name TEXT
vehicle_id TEXT
event_count INTEGER
PRIMARY KEY (date, event_name, vehicle_id)
```

事件仅包括：

- phone_click；
- sms_click；
- email_click；
- availability_open；
- lead_submitted。

---

## 8. Cloudflare 资源

建议命名：

```text
Worker: yc-auto-web
D1: yc-auto-prod
R2: yc-auto-vehicle-images
Turnstile widget: yc-auto-public-forms
Access app: yc-auto-admin
```

### 8.1 Worker bindings

```text
DB                  -> D1
VEHICLE_IMAGES      -> R2
IMAGES              -> Cloudflare Images
EMAIL               -> Cloudflare Email Service
ASSETS               -> Workers Assets
```

### 8.2 Variables and secrets

Public vars：

```text
APP_ORIGIN=https://www.ycautousa.com
CANONICAL_HOST=www.ycautousa.com
TURNSTILE_SITE_KEY=...
ADMIN_EMAILS=admin1@example.com,admin2@example.com
EMAIL_FROM=leads@ycautousa.com
EMAIL_TO=sophie@youxuancars.com
```

Secrets：

```text
TURNSTILE_SECRET_KEY
IP_HASH_SALT
```

不要把 secret 写入 repo、日志、迁移 JSON 或 Codex 输出。

### 8.3 Access

创建 path-based Access protection：

```text
www.ycautousa.com/admin*
www.ycautousa.com/api/admin*
```

Allow policy 只包含明确的 1–2 个管理员邮箱。不要配置 `Everyone` 或“所有有效邮箱”。

本地开发使用 `wrangler.jsonc` 的 Access dev identity，不在代码中绕过生产认证。

---

## 9. 数据迁移方案

### 9.1 迁移工具

项目内建立：

```text
scripts/migrate-legacy.ts
```

命令：

```text
npm run migrate:legacy:dry
npm run migrate:legacy:prepare
npm run migrate:legacy:apply
npm run migrate:legacy:verify
```

### 9.2 Crawl 逻辑

起点：

```text
https://www.ycautousa.com/products.html
```

继续发现：

```text
/products_2.html
/products_3.html
/products_4.html
```

并继续直到：

- 下一页 404；
- 页面没有车辆详情链接；
- 或 URL 已访问。

抓取所有详情页链接，优先识别以 `-p.html` 结尾的 product URL，并去重。

### 9.3 详情页解析

解析不能只依赖旧站 CSS class，应同时使用标签文本和正则：

- `VIN:`；
- `MILEAGE:`；
- `PRICE:`；
- `COLOR:`；
- `DRIVE TRAIN:`；
- `TRANSMISSION:`；
- `Product description:`。

图片只接受详情页 Gallery 内、来源位于旧站 `/Uploads/image/` 的图片。排除：

- Header image；
- Logo；
- Captcha；
- QR code；
- Footer image；
- Team photo；
- News image。

### 9.4 数据规范化

- 去除价格 `$`、`,` 和多余空格；
- mileage 转整数；
- VIN 转大写；
- `AUTO` 统一为 `Automatic`；
- `Benz` 统一为 `Mercedes-Benz`；
- `PORCHE` 统一为 `Porsche`，同时在 audit 中记录修改；
- title 大小写规范化但保留原始标题；
- slug 使用 title 加 VIN 后 6 位；
- VIN 缺失时使用 legacy URL hash 保证 slug 唯一；
- 图片按旧页顺序导入；
- 第一张有效图片设为 cover。

### 9.5 Idempotency

迁移必须可重复运行：

- 以 `legacy_url` 作为稳定唯一键；
- 已存在车辆执行 upsert，不重复新增；
- 图片以 SHA-256 hash 去重；
- 第二次运行只更新有变化的数据和新增图片；
- 不自动删除新后台中人工添加的车辆。

### 9.6 迁移状态规则

满足以下条件的记录可自动设为 `available`：

- 有 title；
- 有 price；
- 有 mileage；
- 至少一张有效车辆图片。

以下情况设为 `draft` 并写入 audit：

- 无价格；
- 无图片；
- 页面解析失败；
- 重复 VIN 且无法确认；
- title 无法解析。

VIN 为空本身不阻止发布，但必须出现在 audit report。

### 9.7 迁移输出

```text
migration/output/legacy-inventory.json
migration/output/audit.csv
migration/output/redirects.json
migration/output/migration.sql
migration/output/images-manifest.json
migration/output/run-summary.json
```

`audit.csv` 至少包含：

- legacy URL；
- title；
- parsed VIN；
- price；
- mileage；
- image count；
- target status；
- warnings；
- normalized fields。

### 9.8 图片迁移

迁移脚本将图片下载到临时目录，校验后上传 R2。成功上传且 D1 写入完成后才算成功。

要求：

- 限制并发，避免旧站被大量请求；
- 自动重试 3 次；
- 请求间加入小延迟；
- 验证 HTTP status 和 content-type；
- 计算 hash；
- 失败写入 audit，不跳过不报告；
- 完成后校验 R2 object 数量和 D1 image rows。

### 9.9 两次迁移

1. Beta 阶段执行完整迁移；
2. DNS cutover 前再次执行 delta migration。

这样避免开发期间旧站新增车辆没有进入新系统。

### 9.10 旧 URL

每条旧车辆 URL 写入 `legacy_redirects`，新站收到旧路径时返回 301 到：

```text
/inventory/{new-slug}
```

如果迁移记录仍为 draft，则暂时跳转到 `/inventory`，不要公开 draft。

---

## 10. 安全要求

- Turnstile 必须服务器端验证；
- Turnstile token 失败、过期或重复使用时拒绝提交；
- Lead endpoint 限制 body size；
- 所有输出进行 escaping；
- 不允许管理员输入任意 HTML；
- Description 使用纯文本或受限 Markdown；
- R2 bucket 不公开；
- 图片路由防 path traversal；
- 图片宽度、质量、格式使用 allowlist；
- Admin mutation 必须 same-origin；
- Access identity 必须在 Worker 内复核；
- 所有 D1 查询使用 prepared statements；
- CSP、HSTS、X-Content-Type-Options、Referrer-Policy、Permissions-Policy；
- 生产错误页面不得泄漏 stack trace；
- 审计日志不得记录 secret、Turnstile token 或完整 IP。

---

## 11. SEO 与性能

### 11.1 Canonical

继续使用：

```text
https://www.ycautousa.com
```

Apex `ycautousa.com` 301 到 `www`，避免改变现有索引主机。

### 11.2 SEO 输出

- 动态 title / meta description；
- canonical；
- Open Graph；
- cover image；
- `AutoDealer` JSON-LD；
- 车辆页 `Car` / `Vehicle` + `Offer` JSON-LD；
- 动态 sitemap；
- robots.txt；
- draft / hidden / admin noindex；
- sold 页面保留，availability 标记为 OutOfStock；
- 旧 URL 301。

### 11.3 缓存

- 带 hash 的前端静态资源：长期 immutable；
- R2 图片输出：长期缓存；
- HTML：短 edge TTL，保证库存更新在 60 秒左右可见；
- API 和 admin：`no-store`；
- 不缓存 lead 提交响应。

### 11.4 性能目标

- Mobile Lighthouse Performance >= 85；
- Accessibility >= 95；
- SEO >= 95；
- 无明显 CLS；
- 首屏图片明确 width/height；
- 图片 lazy load；
- hero cover 可 priority load；
- 不加载无用第三方 JS。

---

## 12. 测试方案

### 12.1 Unit tests

- VIN validator；
- NHTSA vPIC response normalizer；
- VIN decode cache；
- NHTSA timeout/error graceful fallback；
- money / mileage normalization；
- slug generator；
- status transitions；
- legacy parser；
- legacy image filtering；
- duplicate handling；
- lead validation；
- redirect resolution。

### 12.2 Integration tests

- D1 CRUD；
- R2 upload/delete/read；
- admin identity allowlist；
- Turnstile testing keys；
- lead write before email；
- email failure fallback；
- sitemap excludes draft；
- sold page remains public。

### 12.3 E2E tests

- 浏览 inventory；
- 筛选和排序；
- 查看车辆；
- 提交询盘；
- admin 新增车辆；
- 多图上传；
- 排序和封面；
- 发布；
- 标 Pending；
- 标 Sold；
- 旧 URL 301；
- 手机尺寸测试。

### 12.4 Production verification

上线脚本至少检查：

- Home 200；
- Inventory 200；
- 随机 5 个车辆页 200；
- sitemap 200；
- robots 200；
- 旧 URL 301；
- 图片 200 且 content-type 正确；
- admin 未登录被 Access 拦截；
- lead 使用 Turnstile test/prod flow；
- D1 count 与 migration summary 一致。

---

## 13. Cloudflare 上线步骤

### 13.1 前置输入

在真正 production deploy 前只需要确认：

1. Cloudflare account 和 zone 权限；
2. `www.ycautousa.com` 域名控制权；
3. 1–2 个管理员邮箱；
4. Lead 通知收件邮箱；
5. Cloudflare Email Service 发件域名；
6. 最终业务电话、邮箱、地址和营业时间。

### 13.2 推荐流程

1. 本地 scaffold；
2. 创建 D1、R2；
3. 配置 bindings；
4. 本地 migrations；
5. 运行 unit/integration/E2E；
6. deploy 到 `workers.dev` preview；
7. 配置 Access；
8. 配置 Turnstile；
9. 配置 Email Service；
10. 完整 legacy dry-run；
11. 审核 audit；
12. Apply migration；
13. 在 preview 验收；
14. DNS cutover 前做 delta migration；
15. 绑定 `www.ycautousa.com`；
16. Apex 301 到 www；
17. 验证旧 URL；
18. 保留旧主机备份至少 7 天；
19. 关闭旧站写入。

迁移 DNS 时必须先保留并核对所有 MX、TXT、SPF、DKIM、DMARC 记录，不能因为网站切换破坏现有邮箱。

---

## 14. 备份与持续运营

- D1 Time Travel 自动开启；
- Workers Paid 环境可按分钟恢复最近 30 天；
- 每次 schema 变更前记录 Time Travel bookmark；
- 每季度执行 D1 SQL export；
- R2 图片使用不可变 key，避免覆盖；
- 删除车辆采用 soft delete；
- 删除图片先从 UI 隐藏，不立即清理 object；
- 通过定期运维再清理长期 orphan objects；
- 保留 `docs/OPERATIONS.md`，写明恢复、导出、迁移和回滚命令。

---

## 15. 明确不进入 v1 的内容

- 商业/收费 VIN 数据服务；
- NHTSA Recalls / complaints 等非必要车辆数据扩展；
- Carfax integration；
- AutoTrader / Cars.com / CarGurus feed；
- Facebook Marketplace sync；
- Financing application；
- Credit check；
- Trade-in valuation；
- Online payment；
- Customer account；
- Salesperson account；
- Commission；
- Accounting；
- Contract generation；
- DMV；
- Full CRM；
- SMS sending service；
- AI description generation；
- 多语言 CMS。

这些内容以后必须作为新 scope 单独报价。

---

## 16. 完工定义

项目只有同时满足以下条件才算完成：

- 代码可以从干净环境安装、测试、构建；
- Cloudflare bindings 清晰可重复配置；
- D1 migrations 可从零执行；
- 公开站所有页面完成；
- Admin 完成；
- 图片完整工作；
- Leads 完成；
- Access、Turnstile、Email Service 接口完成；
- 旧站迁移脚本完成并可重复运行；
- 生成 migration audit；
- 旧 URL 重定向完成；
- unit、integration、E2E 通过；
- production verification 通过；
- README 和运维文档完整；
- 不存在未解释的 production TODO；
- 没有引入禁止的外部运行时服务。

---

## 17. 建议交付文件

```text
README.md
docs/ARCHITECTURE.md
docs/CLOUDFLARE_SETUP.md
docs/MIGRATION.md
docs/CUTOVER.md
docs/ADMIN_GUIDE.md
docs/OPERATIONS.md
docs/SECURITY.md
migrations/*.sql
scripts/migrate-legacy.ts
scripts/bootstrap-cloudflare.ts
scripts/verify-production.ts
migration/output/*
```

这份方案对应的可直接交给 Codex 的完整主提示词，见：

`YC_Auto_Codex_Master_Prompt.md`

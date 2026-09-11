# 链动小铺助手

链动小铺助手是一个 Chrome Manifest V3 扩展，面向 `wzyp.cn` 小铺页面提供商品整理、订单查询、卡密查看和订单确认信息自动填写功能。

## 安装

从 Chrome Web Store 安装：

https://chromewebstore.google.com/detail/%E9%93%BE%E5%8A%A8%E5%B0%8F%E9%93%BA%E5%8A%A9%E6%89%8B/gbamfnhpibghocogkbdhopchdmeaeofo

## 功能

- 在目标小铺页按价格重新排列商品，并自动隐藏缺货商品。
- 在“设置”页控制缺货商品过滤，保存订单联系方式和可选安全密码。
- 在“订单”页完成人机验证后查询订单，支持每页 10 条的分页浏览。
- 点击订单项读取卡密；再次点击已展开的订单不会隐藏卡密。
- 通过订单项右侧箭头图标打开对应订单详情页。
- 当 WZYP 页面出现“订单确认”弹窗时，自动填写已保存且当前为空的联系方式和安全密码，不会覆盖用户已输入的内容。

## 使用方法

1. 打开任意 `https://wzyp.cn` 页面，点击浏览器工具栏中的“链动小铺助手”。
2. 在“设置”页填写并保存联系方式；安全密码可留空。
3. 打开“订单”页，按提示完成人机验证后查看订单和卡密。
4. 提交订单前，请自行核对订单确认弹窗中的联系方式和安全密码。

## 本地存储与隐私

扩展使用 Chrome 的本地扩展存储保存缺货商品过滤开关、用户主动填写的联系方式、可选安全密码和订单查询的人机验证状态。

联系方式和安全密码不会被写入扩展安装包，也不会发送给第三方服务。它们仅在用户主动查询订单、读取卡密或确认下单时，按 WZYP 页面和接口要求使用。安全密码以浏览器扩展本地存储的明文形式保存，请仅在受信任的浏览器配置中使用。

## 本地开发

1. 打开 `chrome://extensions`。
2. 开启“开发者模式”。
3. 点击“加载已解压的扩展程序”。
4. 选择本项目根目录。

修改 `manifest.json`、`popup.html` 或 `src/content.js` 后，需要在 `chrome://extensions` 中点击扩展的“重新加载”，再刷新 WZYP 页面。

## 打包

每次发布更新前，请提升 `manifest.json` 中的 `version`，然后生成上传包：

```sh
mkdir -p dist
zip -r dist/linked-shop-helper-<version>.zip manifest.json popup.html tokens.css src assets -x '*/.DS_Store'
```

## 项目结构

```text
assets/          扩展与商店图标
src/content.js   WZYP 页面内的商品、订单和自动填写逻辑
src/popup.js     弹窗交互、订单配置与订单列表逻辑
src/popup.css    弹窗样式
popup.html       弹窗页面
tokens.css       视觉令牌
manifest.json    Chrome Manifest V3 配置
```

# JavBus Emby Checker

Chrome/Edge 浏览器插件，检测 JavBus 网页影片是否存在于本地 Emby 库中。

## 功能

- 自动检测网页中的影片编号
- 与本地 Emby 服务器比对
- 显示"已收藏"或"未收藏"标记
- 点击标记可直接跳转到 Emby 详情页

## 安装

### Chrome
1. 打开 `chrome://extensions/`
2. 开启"开发者模式"
3. 点击"加载已解压的扩展程序"
4. 选择插件目录

### Edge
1. 打开 `edge://extensions/`
2. 开启"开发人员模式"
3. 点击"加载解压缩的扩展"
4. 选择插件目录

## 配置

1. 点击插件图标打开设置
2. 填写 Emby 服务器信息：
   - 服务器地址（如 `http://192.168.1.100:8096`）
   - API Key（在 Emby 后台获取）
   - 用户 ID
3. 点击"保存配置"
4. 点击"刷新数据"加载影片列表

## 获取 API Key

1. 登录 Emby 后台
2. 进入设置 → API密钥
3. 创建或复制现有密钥

## 支持网站

- JavBus：*.javbus.com
- 可自定义JavBus域名

## 文件结构

```
├── manifest.json
├── background.js
├── content.js
├── popup.html
├── popup.js
├── config.json
└── icons/
    ├── icon16.png
    ├── icon48.png
    └── icon128.png
```

## License

MIT

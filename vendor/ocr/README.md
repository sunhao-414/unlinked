# 本地图片识别资源

本目录随网站一起部署。识别引擎及语言模型从本站加载，不会将用户图片发送给模型发行站点。

- Tesseract.js 7.0.0：https://github.com/naptha/tesseract.js （Apache-2.0，见 LICENSE-tesseract.txt）。
- Tesseract.js-core 7.0.0：https://github.com/naptha/tesseract.js-core （Apache-2.0，见 LICENSE-core.txt）。
- @tesseract.js-data/chi_sim 1.0.0、@tesseract.js-data/eng 1.0.0：官方 4.0.0_best_int 中文 / 英文模型，源自 https://github.com/tesseract-ocr/tessdata_best （Apache-2.0）。
- 核心同时提供普通、SIMD、Relaxed SIMD 的 LSTM 与兼容构建，由引擎按浏览器能力选择。

发行包来源、完整性及各资源 SHA-256 见 manifest.json。重新准备资源可在项目根目录运行 `node scripts/download-ocr.mjs`，需要网络与系统 tar 工具；开发运行及部署无需执行 npm install。

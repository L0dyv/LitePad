/**
 * 构建后处理脚本
 * 将 win-unpacked 重命名为 LitePad-版本号
 */
const fs = require('fs');
const path = require('path');

const packageJson = require('../package.json');
const version = packageJson.version;

const releaseDir = path.join(__dirname, '..', 'release');
const srcDir = path.join(releaseDir, 'win-unpacked');
const destDir = path.join(releaseDir, `LitePad-${version}`);

if (fs.existsSync(srcDir)) {
    // 如果目标目录已存在，先删除
    if (fs.existsSync(destDir)) {
        fs.rmSync(destDir, { recursive: true });
        console.log(`已删除旧目录: LitePad-${version}`);
    }

    fs.renameSync(srcDir, destDir);
    console.log(`✓ 已重命名: win-unpacked -> LitePad-${version}`);
} else {
    console.log('未找到 win-unpacked 目录，跳过重命名');
}

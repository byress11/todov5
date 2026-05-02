const fs = require('fs');
const path = require('path');

console.log('🎨 ICO dosyası oluşturuluyor...');

// app_icon.png'yi build/icon.ico olarak kopyala
// Electron Builder otomatik olarak PNG'yi ICO'ya çevirebilir
const sourceIcon = path.join(__dirname, 'app_icon.png');
const buildDir = path.join(__dirname, 'build');
const targetIcon = path.join(buildDir, 'icon.ico');
const targetPng = path.join(buildDir, 'icon.png');

// Build klasörünü oluştur
if (!fs.existsSync(buildDir)) {
    fs.mkdirSync(buildDir, { recursive: true });
}

// PNG dosyasını kopyala
if (fs.existsSync(sourceIcon)) {
    // .ico olarak kopyala (electron-builder otomatik işler)
    fs.copyFileSync(sourceIcon, targetIcon);
    fs.copyFileSync(sourceIcon, targetPng);
    console.log('✅ Icon dosyaları hazırlandı');
    console.log('   - build/icon.ico');
    console.log('   - build/icon.png');
} else {
    console.error('❌ app_icon.png bulunamadı!');
    process.exit(1);
}

console.log('✨ Build hazırlığı tamamlandı!');

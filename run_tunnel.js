import os from 'os';
import localtunnel from 'localtunnel';
import qrcode from 'qrcode-terminal';

function getLocalIp() {
    const interfaces = os.networkInterfaces();
    for (const name of Object.keys(interfaces)) {
        for (const iface of interfaces[name]) {
            if (iface.family === 'IPv4' && !iface.internal) {
                return iface.address;
            }
        }
    }
    return '127.0.0.1';
}

(async () => {
    const localIp = getLocalIp();
    const localUrl = `http://${localIp}:5173`;

    console.log('\n=============================================================');
    console.log('🚀 초고속 안정망(같은 와이파이 전용) QR 접속 🚀');
    console.log('▶ 스마트폰이 PC와 [같은 공유기(Wi-Fi)]에 연결되어 있다면');
    console.log('  아래 QR 코드를 스캔하세요! (오류 0%, 속도 최상)');
    console.log('=============================================================\n');
    
    qrcode.generate(localUrl, { small: true });
    
    console.log('\n👉 직접 주소창 링크 (Wi-Fi 전용): ' + localUrl);

    console.log('\n-------------------------------------------------------------');
    console.log('🌍 외부망(5G/LTE 등) 외출용 접속 (Localtunnel 터널링) 🌍');
    console.log('-------------------------------------------------------------\n');
    
    try {
        console.log('외부 라우팅 서버 연결 중... (잠시만 기다려주세요)');
        const tunnel = await localtunnel({ port: 5173 });
        console.log('✅ 외부망 접속 링크: ' + tunnel.url);
        tunnel.on('close', () => {
            console.log('외부망 터널이 닫혔습니다.');
        });
    } catch (e) {
         console.log('❌ 현재 전 세계 외부망(localtunnel) 서버가 마비되었습니다.\n집 안에서 위쪽 와이파이 QR 코드만 이용해주세요.');
    }
    
    console.log('\n(이 검은 터널링 창을 끄면 스마트폰 일체 접속이 끊깁니다)');
})();

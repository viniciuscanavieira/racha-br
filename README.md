# Racha BR

Jogo web de carros brasileiros: garagem, oficina, visual, economia, arrancada, racha no trânsito e corrida de rua, com corrida ao vivo entre amigos.

## Estrutura
- `index.html` — o jogo inteiro (HTML, CSS e JS). Three.js e PeerJS vêm de CDN.
- `api/rank.js` — função da Vercel que guarda o ranking no Vercel Blob (`BLOB_READ_WRITE_TOKEN`).
- `vercel.json` — cabeçalhos de cache.

## Online
A corrida ao vivo usa WebRTC (PeerJS). Cada sala tem um código; quem abre `/#sala-CODIGO` entra direto.
A sinalização usa o servidor público do PeerJS; para produção, troque por um PeerServer próprio
e adicione um servidor TURN em `PEER_OPTS` para redes móveis restritivas.

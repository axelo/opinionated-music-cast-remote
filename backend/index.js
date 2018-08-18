const { send } = require('micro');
const { router, get } = require('microrouter');
const http = require('http');

const YAMAHA_IP = process.env.YAMAHA_IP || '192.168.1.216';
const LOCAL_IP = process.env.LOCAL_IP || '192.168.1.187';

const request = (path, headers) =>
  new Promise((resolve, reject) =>
    http
      .get(
        {
          localAddress: LOCAL_IP,
          host: YAMAHA_IP,
          path,
          timeout: 3000,
          headers: {
            'User-Agent': 'yas-306-remote',
            Accept: 'application/vnd.musiccast.v1+json',
            ...headers
          }
        },
        resp => {
          let data = '';

          resp.on('data', chunk => (data += chunk));
          resp.on('end', () => {
            try {
              const body = JSON.parse(data);

              if (body && body.response_code === 0) resolve(body);
              else reject(new Error('Non successful response code'));
            } catch (err) {
              reject(err);
            }
          });
        }
      )
      .on('error', err => {
        reject(err);
      })
  );

const musicCastStatusToStatus = musicCastStatus => ({
  isPowerOn: musicCastStatus.power === 'on',
  isInputTv: musicCastStatus.input === 'bd_dvd',
  isMuted: musicCastStatus.mute === true,
  volume: musicCastStatus.volume || 0
});

const getStatus = async (req, res) => {
  const body = await request('/YamahaExtendedControl/v1/main/getStatus');
  const transformed = musicCastStatusToStatus(body);
  send(res, 200, transformed);
};

module.exports = router(get('/status', getStatus));

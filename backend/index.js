const { send, createError } = require('micro');
const { router, get } = require('microrouter');
const http = require('http');
const eventServer = require('dgram').createSocket('udp4');

const YAMAHA_IP = process.env.YAMAHA_IP || '192.168.1.216';
const LOCAL_IP = process.env.LOCAL_IP || '192.168.1.187';
const INCOMING_EVENT_SERVER_PORT = parseInt(process.env.PORT) || 41100;

let eventClients = [];

const request = (path, headers, ignoreResponseCode) =>
  new Promise((resolve, reject) => {
    const req = http.get({
      localAddress: LOCAL_IP,
      host: YAMAHA_IP,
      path,
      timeout: 5000,
      headers: {
        'User-Agent': 'yas-306-remote',
        Accept: 'application/vnd.musiccast.v1+json',
        ...headers
      }
    });

    req.on('response', resp => {
      let data = '';

      resp.on('data', chunk => (data += chunk));
      resp.on('end', () => {
        try {
          const body = JSON.parse(data);

          if (body && (body.response_code === 0 || ignoreResponseCode))
            resolve(body);
          else
            reject(
              createError(500, 'Non successful response code from the receiver')
            );
        } catch (err) {
          reject(createError(500, 'Invalid response from the receiver', err));
        }
      });
    });

    req.on('timeout', () => {
      req.abort();
      reject(
        createError(503, 'Took too long while communicating with the receiver')
      );
    });

    req.on('error', err => {
      if (req.aborted) return;

      reject(
        createError(503, 'Error while communicating with the receiver', err)
      );
    });
  });

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

const events = (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive'
  });

  console.log('Client subscribing to receiver events');
  eventClients.push(res);

  request('/YamahaExtendedControl/v1/main/getStatus')
    .then(musicCastStatusToStatus)
    .then(status => {
      res.write(
        'data: ' + JSON.stringify({ tag: 'status', data: status }) + '\n\n'
      );
    })
    .catch(err =>
      res.write(
        'data: ' + JSON.stringify({ tag: 'error', data: err.message }) + '\n\n'
      )
    );

  res.write('data: { "tag": "connected", "data": null }\n\n');

  res.socket.on('close', () => {
    console.log('Client left');
    eventClients = eventClients.filter(clientRes => clientRes !== res);
  });
};

const notFound = (req, res) => send(res, 404, { message: 'Route not found' });

eventServer.on('close', () => {
  console.log('ON CLOSING eventServer');
  eventClients.forEach(res => res.emit('close'));
});

eventServer.on('error', err => {
  console.log('Event server error', err);
});

eventServer.on('message', msg => {
  let body = '';

  try {
    body = JSON.parse(msg.toString('utf8'));

    if (body.main && body.main.volume) {
      const outMessage =
        'data: ' +
        JSON.stringify({
          tag: 'statusVolume',
          data: {
            volume: body.main.volume
          }
        }) +
        '\n\n';

      console.log('Sending event', outMessage);

      eventClients.forEach(res => {
        res.write(outMessage);
      });
    }
  } catch (err) {
    console.warn('Could not parse event', msg.toString());
    return;
  }

  console.log(body);
});

eventServer.on('listening', () => {
  const address = eventServer.address();
  const { port, address: ipAddress } = address;

  console.log(
    'Incoming event server is listening at port',
    ipAddress + ':' + port
  );

  const subscribeOnReceiverEvents = () => {
    request(
      '/YamahaExtendedControl/v1',
      {
        'X-AppName': 'MusicCast/1',
        'X-AppPort': port
      },
      true
    )
      .then(() => console.log('Subscribing on receiver events'))
      .catch(err => {
        console.error('Could not start subscribing on receiver events', err);
      });

    setTimeout(subscribeOnReceiverEvents, 5 * 60 * 1000);
  };

  subscribeOnReceiverEvents();
});

eventServer.bind(INCOMING_EVENT_SERVER_PORT, LOCAL_IP);

process.once('SIGUSR2', () => {
  console.log('GOT SIGUSR2');

  try {
    eventServer.close(() => {
      console.log('eventServer closed');
    });
    eventClients.forEach(res => res.emit('close'));
  } catch (err) {
    console.error('SIGUSR2', err);
  }
});

module.exports = router(
  get('/api/status', getStatus),
  get('/api/events', events),
  get('*', notFound)
);

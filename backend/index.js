const { send, createError } = require('micro');
const { router, get } = require('microrouter');
const http = require('http');
const eventServer = require('dgram').createSocket('udp4');

const YAMAHA_IP = process.env.YAMAHA_IP || '192.168.1.216';
const LOCAL_IP = process.env.LOCAL_IP || '192.168.1.187';
const INCOMING_EVENT_SERVER_PORT = parseInt(process.env.PORT) || 41100;

let eventClients = [];

const sendEventToClients = data => {
  const eventMessage = 'data: ' + JSON.stringify(data) + '\n\n';

  console.log('Sending event', data);
  console.log('Nb of eventClients', eventClients.length);

  eventClients.forEach(res => res.write(eventMessage));
};

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

const convertToEventData = body => {
  if (body && body.main && body.main.hasOwnProperty('volume')) {
    return {
      success: true,
      data: {
        tag: 'volume',
        data: body.main.volume
      }
    };
  }

  if (body && body.main && body.main.hasOwnProperty('mute')) {
    return {
      success: true,
      data: {
        tag: 'mute',
        data: body.main.mute
      }
    };
  }

  if (body && body.main && body.main.hasOwnProperty('input')) {
    return {
      success: true,
      data: {
        tag: 'tv',
        data: body.main.input === 'bd_dvd'
      }
    };
  }

  if (body && body.main && body.main.hasOwnProperty('power')) {
    return {
      success: true,
      data: {
        tag: 'power',
        data: body.main.power === 'on'
      }
    };
  }

  return {
    eventData: false,
    data: body
  };
};

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

  res.write('data: { "tag": "connected", "data": null }\n\n');

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

  res.socket.on('close', () => {
    console.log('Client left');
    eventClients = eventClients.filter(clientRes => clientRes !== res);
  });
};

const notFound = (req, res) => send(res, 404, { message: 'Route not found' });

eventServer.on('close', () => {
  console.log('Closing event server');
  eventClients.forEach(res => res.emit('close'));
  eventClients = [];
});

eventServer.on('error', err => {
  if (err && err.code === 'EADDRINUSE') {
    throw new Error(
      'Event server port ' + INCOMING_EVENT_SERVER_PORT + ' not available'
    );
  }
});

eventServer.on('message', msg => {
  const msgText = msg.toString('utf8');
  let body = '';

  try {
    body = JSON.parse(msgText);
  } catch (err) {
    console.warn('Could not parse event', msgText);
    return;
  }

  const eventData = convertToEventData(body);

  if (!eventData.success) {
    console.debug('Unhandled event', eventData.data);
    return;
  }

  sendEventToClients(eventData.data);
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
  process.stdin.removeAllListeners('keypress');

  try {
    eventServer.close();

    eventClients = [];
  } catch (err) {
    console.error('SIGUSR2', err);
  }
});

const readline = require('readline');

readline.emitKeypressEvents(process.stdin);
process.stdin.setRawMode(true);

const debugStatus = {
  isPowerOn: false,
  isInputTv: false,
  isMuted: false,
  volume: 0
};

const handleKeypress = (str, key) => {
  if (key.ctrl && key.name === 'c') return process.exit();

  switch (str) {
    case 's':
      return sendEventToClients({ tag: 'status', data: debugStatus });
    case '+':
      return sendEventToClients({ tag: 'volume', data: ++debugStatus.volume });
    case '-':
      return sendEventToClients({ tag: 'volume', data: --debugStatus.volume });
    case 'm':
      return sendEventToClients({
        tag: 'mute',
        data: (debugStatus.isMuted = !debugStatus.isMuted)
      });
    case 'p':
      return sendEventToClients({
        tag: 'power',
        data: (debugStatus.isPowerOn = !debugStatus.isPowerOn)
      });
    case 't':
      return sendEventToClients({
        tag: 'tv',
        data: (debugStatus.isInputTv = !debugStatus.isInputTv)
      });

    default:
      process.stdout.write(key.sequence);
  }
};

process.stdin.on('keypress', handleKeypress);

module.exports = router(
  get('/api/status', getStatus),
  get('/api/events', events),
  get('*', notFound)
);

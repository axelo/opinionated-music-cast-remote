const stoppable = require('stoppable');
const { default: micro, send, createError, text } = require('micro');
const { router, get, post } = require('microrouter');
const serveHandler = require('serve-handler');
const http = require('http');
const eventServer = require('dgram').createSocket('udp4');

const YAMAHA_IP = process.env.YAMAHA_IP || '192.168.1.216';
const LOCAL_IP = process.env.LOCAL_IP || '192.168.1.187';
const INCOMING_EVENT_SERVER_PORT = parseInt(process.env.EVENT_PORT) || 41100;

let eventClients = [];

const sendEventToClients = data => {
  const eventMessage = 'data: ' + JSON.stringify(data) + '\n\n';

  console.log('Sending event', data, 'to', eventClients.length, 'client (s)');

  eventClients.forEach(client => client.res.write(eventMessage));
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

const requestStatus = () =>
  request('/YamahaExtendedControl/v1/main/getStatus').then(
    musicCastStatusToStatus
  );

const musicCastStatusToStatus = musicCastStatus => ({
  isPowerOn: musicCastStatus.power === 'on',
  isInputTv: musicCastStatus.input === 'bd_dvd',
  isMuted: musicCastStatus.mute === true,
  volume: musicCastStatus.volume || 0
});

const powerEvent = enabled => ({
  tag: 'power',
  data: enabled
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

const postCommand = async (req, res) => {
  const command = await text(req);
  const requestCommand = asRequestCommand(command);

  if (requestCommand) {
    await requestCommand();
    send(res, 204);
  } else {
    send(res, 400);
  }
};

const requestSetPower = enabled =>
  request(
    '/YamahaExtendedControl/v1/main/setPower?power=' +
      (enabled ? 'on' : 'standby')
  );

const asRequestCommand = command => {
  switch (command) {
    case 'volumeup':
      return () =>
        request('/YamahaExtendedControl/v1/main/setVolume?volume=up&step=2');
    case 'volumedown':
      return () =>
        request('/YamahaExtendedControl/v1/main/setVolume?volume=down&step=2');
    case 'togglemute':
      return () =>
        requestStatus().then(status =>
          request(
            '/YamahaExtendedControl/v1/main/setMute?enable=' + !status.isMuted
          )
        );
    case 'inputtv':
      return () =>
        request('/YamahaExtendedControl/v1/main/setInput?input=bd_dvd');

    case 'togglepower':
      return () =>
        requestStatus()
          .then(status => !status.isPowerOn)
          .then(requestSetPower);

    default:
      return undefined;
  }
};

const getIpFromRequest = req =>
  (req.headers['x-forwarded-for'] || '').split(',').pop() ||
  req.connection.remoteAddress ||
  req.socket.remoteAddress ||
  req.connection.socket.remoteAddress;

const events = (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive'
  });

  const clientIp = getIpFromRequest(req);

  eventClients = eventClients
    .filter(client => client.ip !== clientIp)
    .concat([{ ip: clientIp, res }]);

  console.log(
    eventClients.length +
      ' client(s) (' +
      eventClients.map(c => c.ip).join(', ') +
      ') subscribing to receiver events'
  );

  res.write('data: { "tag": "connected", "data": null }\n\n');

  requestStatus()
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
    eventClients = eventClients.filter(client => client.ip !== clientIp);
    console.log(
      'Client left,',
      eventClients.length,
      'client(s) still subscribing'
    );
  });
};

const notFound = (req, res) => send(res, 404, { message: 'Route not found' });

eventServer.on('close', () => {
  console.log('Closing event server');
  eventClients.forEach(client => client.res.socket.destroy());
  eventClients = [];
});

eventServer.on('error', err => {
  if (err && err.code === 'EADDRINUSE') {
    throw new Error(
      'Event server port ' + INCOMING_EVENT_SERVER_PORT + ' not available'
    );
  } else {
    console.error('eventServer error', err);
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

  const event = eventData.data;

  sendEventToClients(event);

  if (event.tag === 'mute' && event.data === false) {
    // When mute is enabled and we set power to standby the yas-306 receiver will only send
    // mute disabled event and then never send the power standby event, so resend current power status
    // on mute disabled
    requestStatus()
      .then(status => status.isPowerOn)
      .then(powerEvent)
      .then(sendEventToClients);
  }
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
      .catch(err =>
        console.error('Could not start subscribing on receiver events', err)
      );

    setTimeout(subscribeOnReceiverEvents, 5 * 60 * 1000);
  };

  subscribeOnReceiverEvents();
});

eventServer.bind(INCOMING_EVENT_SERVER_PORT, LOCAL_IP);

// const debugStatus = {
//   isPowerOn: false,
//   isInputTv: false,
//   isMuted: false,
//   volume: 0
// };

// process.once('SIGUSR2', () => {
//   console.log('Got SIGUSR2');

//   process.stdin.removeAllListeners('keypress');

//   try {
//     eventServer.close();

//     eventClients = [];
//   } catch (err) {
//     console.error('SIGUSR2', err);
//   }
// });

// const handleKeypress = (str, key) => {
//   if (key.ctrl && key.name === 'c') return process.exit();

//   switch (str) {
//     case 's':
//       return sendEventToClients({ tag: 'status', data: debugStatus });
//     case '+':
//       return sendEventToClients({ tag: 'volume', data: ++debugStatus.volume });
//     case '-':
//       return sendEventToClients({ tag: 'volume', data: --debugStatus.volume });
//     case 'm':
//       return sendEventToClients({
//         tag: 'mute',
//         data: (debugStatus.isMuted = !debugStatus.isMuted)
//       });
//     case 'p':
//       return sendEventToClients(
//         powerEvent((debugStatus.isPowerOn = !debugStatus.isPowerOn))
//       );
//     case 't':
//       return sendEventToClients({
//         tag: 'tv',
//         data: (debugStatus.isInputTv = !debugStatus.isInputTv)
//       });

//     default:
//       process.stdout.write(key.sequence);
//   }
// };

// if (!process.env.DISABLE_DEBUG_KEYS) {
// const readline = require('readline');
// readline.emitKeypressEvents(process.stdin);
// process.stdin.setRawMode(true);
// process.stdin.on('keypress', handleKeypress);
// }

const staticFiles = (req, res) =>
  serveHandler(req, res, {
    public: 'public',
    directoryListing: false
  });

const server = stoppable(
  micro(
    router(
      post('/api/command', postCommand),
      get('/api/events', events),
      get('/api/*', notFound),
      get('*', staticFiles)
    )
  )
);

server.on('error', err => {
  console.error('micro:', err.stack);
  process.exit(1);
});

server.listen(parseInt(process.env.PORT || 4000), () => {
  const gracefulShutdown = () => {
    console.log('\nmicro: Gracefully shutting down. Please wait...');
    eventServer.close(() => server.stop(process.exit));
  };

  process.once('SIGINT', gracefulShutdown);
  process.once('SIGTERM', gracefulShutdown);

  console.log(`micro: Accepting connections on port ${server.address().port}`);
});

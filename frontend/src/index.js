function connectToEventSource(
  receiverEventPort,
  reconnectTimeout,
  pingTimeout
) {
  var eventSource;
  var reconnectTimeoutId;
  var pingTimeoutId;

  function clearPingTimeout() {
    if (pingTimeoutId) {
      clearTimeout(pingTimeoutId);
      pingTimeoutId = undefined;
    }
  }

  function clearReconnectTimeout() {
    if (reconnectTimeoutId) {
      clearTimeout(reconnectTimeoutId);
      reconnectTimeoutId = undefined;
    }
  }

  function parseMessageData(data) {
    try {
      return JSON.parse(data);
    } catch (err) {
      return { tag: 'invalidEvent', data: data };
    }
  }

  function tryToConnect() {
    if (eventSource) {
      eventSource.close();
    }

    eventSource = new EventSource('api/events');

    eventSource.onopen = function() {
      clearPingTimeout();
      clearReconnectTimeout();

      pingTimeoutId = setTimeout(tryToConnect, pingTimeout);
    };

    eventSource.onerror = function() {
      clearPingTimeout();
      clearReconnectTimeout();

      receiverEventPort.send({ tag: 'disconnected' });

      eventSource.close();

      reconnectTimeoutId = setTimeout(tryToConnect, reconnectTimeout);
    };

    eventSource.onmessage = function(evt) {
      receiverEventPort.send(parseMessageData(evt.data));
    };
  }

  tryToConnect();
}

document.addEventListener('DOMContentLoaded', function(event) {
  var app = Elm.Main.init({ flags: 1 });
  var receiverEventPort = app.ports.receiverEvent;

  if (!receiverEventPort) {
    throw new Error('Missing port "receiverEvent"');
  }

  // Delay connection to prevent seeing loading wheel forever on iOS
  setTimeout(function() {
    connectToEventSource(receiverEventPort, 5 * 1000, 60 * 1000);
  }, 0);
});

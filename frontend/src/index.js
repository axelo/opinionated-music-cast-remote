function parseMessageData(data) {
  try {
    return JSON.parse(data);
  } catch (err) {
    return { tag: 'invalidEvent', data: data };
  }
}

function connectToEventSource(receiverEventPort, reconnectTimeout) {
  function tryToConnect() {
    var eventSource = new EventSource('api/events');

    eventSource.onerror = function() {
      if (eventSource.readyState === 2) {
        receiverEventPort.send({ tag: 'disconnected' });
        eventSource.close();
        setTimeout(tryToConnect, reconnectTimeout);
      }
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

  // iOS workaround to prevent seeing loading wheel forever
  setTimeout(function() {
    connectToEventSource(receiverEventPort, 5000);
  }, 1000);
});

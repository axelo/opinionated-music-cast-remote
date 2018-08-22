function parseMessageData(data) {
  try {
    return JSON.parse(data);
  } catch (err) {
    return { tag: 'invalidEvent', data: data };
  }
}

document.addEventListener('DOMContentLoaded', function(event) {
  var app = Elm.Main.init({ flags: 1 });
  var receiverEventPort = app.ports.receiverEvent;

  if (!receiverEventPort) {
    throw new Error('Missing port "receiverEvent"');
  }

  var eventSource = new EventSource('api/events');

  eventSource.onerror = function(err) {
    if (eventSource.readyState === 2) {
      receiverEventPort.send({ tag: 'disconnected' });
    }
  };

  eventSource.onmessage = function(e) {
    receiverEventPort.send(parseMessageData(e.data));
  };
});

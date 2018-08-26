# Opinionated Yamaha MusicCast Remote

## Why

Fun project for trying out Elm on the frontend, plus very convenient when hanging out in the sofa and the real remote is at least two meters away.

Tested on a Yamaha YAS-306

![Screenshot](https://raw.githubusercontent.com/axelo/opinionated-music-cast-remote/master/screenshot.png)

## Usage

### Production

#### Build the frontend

    yarn --cwd frontend build:prod

#### Copy or link the `build` folder under frontend to a folder named `public` under backend

    cp -R frontend/build backend/public

or

    ln -s frontend/build backend/public

#### Start the backend server

Specify the following env variables before starting the server

    YAMAHA_IP # The ip address to your receiver
    LOCAL_IP # Your local ip address to use, 0.0.0.0 could work in some setups
    EVENT_PORT # Port listening for events from the receiver, defaults to 41100

Like this

    YAMAHA_IP=192.168.1.216 LOCAL_IP=192.168.1.187 yarn --cwd backend start

Open a browser at `http://localhost:4000`

### Development

#### Start the api-server

Specify the following env variables before starting the server

    YAMAHA_IP # The ip address to your receiver
    LOCAL_IP # Your local ip address to use, 0.0.0.0 could work in some setups
    EVENT_PORT # Port listening for events from the receiver, defaults to 41100

Like this

    YAMAHA_IP=192.168.1.216 LOCAL_IP=192.168.1.187 yarn --cwd backend dev

#### Start the frontend dev-server

    yarn --cwd frontend start

Open a browser at `http://localhost:3000`

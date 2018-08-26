# Opinionated Yamaha MusicCast Remote

## Why

Fun project for trying out Elm on the frontend, plus very convenient when hanging out in the sofa and the real remote is at least 2 meters away.

Tested on a Yamaha YAS-306

![Screenshot](https://raw.githubusercontent.com/axelo/opinionated-music-cast-remote/master/screenshot.png)

## Usage

### Production

Build the frontend

    yarn --cwd frontend build:prod

Copy or link the build folder under frontend to a folder named public under backend

    cp -R frontend/buld backend/public

or

    ln -s frontend/build backend/public

Start the backend server

    yarn --cwd backend start

Open the browser on `http://localhost:4000`

### Development

Start the api-server

    yarn --cwd backend dev

Start the frontend dev-server

    yarn --cwd backend start

Open the browser on `http://localhost:3000`

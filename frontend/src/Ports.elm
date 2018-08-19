port module Ports exposing (..)

import Json.Decode as D


port receiverEvent : (D.Value -> msg) -> Sub msg

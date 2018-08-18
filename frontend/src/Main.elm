module Main exposing (main)

import Browser
import Browser.Navigation as Nav
import Html exposing (Html, a, div, footer, header, main_, nav, text)
import Url exposing (Url)


-- MODEL


type alias Model =
    { navKey : Nav.Key
    }


init : Int -> Url -> Nav.Key -> ( Model, Cmd Msg )
init flags url navKey =
    ( { navKey = navKey }, Cmd.none )


main =
    Browser.application
        { init = init
        , view = view
        , update = update
        , subscriptions = subscriptions
        , onUrlRequest = LinkClicked
        , onUrlChange = UrlChanged
        }


-- UPDATE


type Msg
    = NoOp
    | LinkClicked Browser.UrlRequest
    | UrlChanged Url


update msg model =
    ( model, Cmd.none )


subscriptions model =
    Sub.none


-- VIEW


view model =
    Browser.Document "MusicCast Remote" [ main_ [] [ text "opinionated-music-cast-remote-backend" ] ]

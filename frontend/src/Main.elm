module Main exposing (main)

import Browser
import Browser.Navigation as Nav
import Html exposing (Html, a, div, footer, header, main_, nav, text)
import Html.Attributes as Attrib
import Http
import Json.Decode as D
import Ports exposing (receiverEvent)
import Url exposing (Url)



-- MODEL


type alias Model =
    { navKey : Nav.Key
    , status : Status
    , error : Maybe String
    }


type Msg
    = LinkClicked Browser.UrlRequest
    | UrlChanged Url
    | Connected
    | GotStatus ReceiverStatus
    | GotVolume StatusVolume
    | GotUnknownEvent String
    | ReceiverEventError String


type Status
    = WaitingForConnection
    | WaitingForStatus
    | Status ReceiverStatus


type alias ReceiverStatus =
    { isPowerOn : Bool
    , isInputTv : Bool
    , isMuted : Bool
    , volume : Int
    }


type alias StatusVolume =
    { volume : Int
    }


type ReceiverEvent
    = EventConneted
    | EventStatus ReceiverStatus
    | EventStatusVolume StatusVolume
    | EventUnkown String



-- INIT


init : Int -> Url -> Nav.Key -> ( Model, Cmd Msg )
init flags url navKey =
    ( { navKey = navKey
      , status = WaitingForConnection
      , error = Nothing
      }
    , Cmd.none
    )



-- UPDATE


update : Msg -> Model -> ( Model, Cmd msg )
update msg model =
    case msg of
        Connected ->
            ( { model | status = WaitingForStatus }, Cmd.none )

        GotStatus receiverStatus ->
            ( { model | status = Status receiverStatus }, Cmd.none )

        GotVolume volume ->
            let
                nextStatus =
                    case model.status of
                        Status receiverStatus ->
                            Status (setStatusVolume volume receiverStatus)

                        _ ->
                            model.status
            in
            ( { model | status = nextStatus }, Cmd.none )

        GotUnknownEvent tag ->
            ( { model | error = Just ("Unknown receiver event '" ++ tag ++ "'") }, Cmd.none )

        ReceiverEventError error ->
            ( { model | error = Just error }, Cmd.none )

        LinkClicked urlReq ->
            ( model, Cmd.none )

        UrlChanged url ->
            ( model, Cmd.none )


subscriptions _ =
    receiverEvent
        (\outside ->
            case D.decodeValue receiverEventDecoder outside of
                Ok event ->
                    case event of
                        EventConneted ->
                            Connected

                        EventStatus status ->
                            GotStatus status

                        EventStatusVolume volume ->
                            GotVolume volume

                        EventUnkown tag ->
                            GotUnknownEvent tag

                Err err ->
                    ReceiverEventError (D.errorToString err)
        )



-- HELPERS


setStatusVolume : StatusVolume -> ReceiverStatus -> ReceiverStatus
setStatusVolume { volume } receiverStatus =
    { receiverStatus | volume = volume }


receiverEventDecoder =
    D.field "tag" D.string
        |> D.andThen
            (\tag ->
                case tag of
                    "connected" ->
                        D.succeed EventConneted

                    "status" ->
                        D.field "data" receiverStatusDecoder

                    "statusVolume" ->
                        D.field "data" receiverStatusVolumeDecoder

                    _ ->
                        D.succeed (EventUnkown tag)
            )


receiverStatusDecoder : D.Decoder ReceiverEvent
receiverStatusDecoder =
    D.map4 ReceiverStatus
        (D.field "isPowerOn" D.bool)
        (D.field "isInputTv" D.bool)
        (D.field "isMuted" D.bool)
        (D.field "volume" D.int)
        |> D.map EventStatus


receiverStatusVolumeDecoder : D.Decoder ReceiverEvent
receiverStatusVolumeDecoder =
    D.map StatusVolume (D.field "volume" D.int)
        |> D.map EventStatusVolume



-- VIEW


view : Model -> Browser.Document msg
view model =
    let
        { power, volume, connectionStatus } =
            case model.status of
                Status receiverStatus ->
                    { power =
                        if receiverStatus.isPowerOn then
                            "ON"

                        else
                            "OFF"
                    , volume = String.fromInt receiverStatus.volume
                    , connectionStatus = "Let's do this!"
                    }

                _ ->
                    { power = "Unkown"
                    , volume = "Unknown"
                    , connectionStatus = "Waiting for status"
                    }
    in
    Browser.Document "MusicCast Remote"
        [ main_
            [ Attrib.class "" ]
            [ div [] [ text ("Connection: " ++ connectionStatus) ]
            , div [] [ text ("Error: " ++ Maybe.withDefault "No errors" model.error) ]
            , div [] [ text ("Power status: " ++ power) ]
            , div [] [ text ("Volume: " ++ volume) ]
            ]
        ]



-- MAIN


main =
    Browser.application
        { init = init
        , view = view
        , update = update
        , subscriptions = subscriptions
        , onUrlRequest = LinkClicked
        , onUrlChange = UrlChanged
        }

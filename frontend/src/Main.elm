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
    { status : Status
    , error : Maybe String
    }


type Msg
    = LinkClicked Browser.UrlRequest
    | UrlChanged Url
    | Connected
    | GotStatus ReceiverStatus
    | GotVolume Int
    | GotMute Bool
    | GotInputTv Bool
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
    | EventVolume Int
    | EventMute Bool
    | EventInputTv Bool
    | EventUnkown String



-- INIT


init : Int -> ( Model, Cmd Msg )
init flags =
    ( { status = WaitingForConnection
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

        GotMute mute ->
            let
                nextStatus =
                    case model.status of
                        Status receiverStatus ->
                            Status (setMute mute receiverStatus)

                        _ ->
                            model.status
            in
            ( { model | status = nextStatus }, Cmd.none )

        GotInputTv tv ->
            let
                nextStatus =
                    case model.status of
                        Status receiverStatus ->
                            Status (setInputTv tv receiverStatus)

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

                        EventVolume volume ->
                            GotVolume volume

                        EventMute mute ->
                            GotMute mute

                        EventInputTv tv ->
                            GotInputTv tv

                        EventUnkown tag ->
                            GotUnknownEvent tag

                Err err ->
                    ReceiverEventError (D.errorToString err)
        )



-- HELPERS


setStatusVolume : Int -> ReceiverStatus -> ReceiverStatus
setStatusVolume volume receiverStatus =
    { receiverStatus | volume = volume }


setMute : Bool -> ReceiverStatus -> ReceiverStatus
setMute mute receiverStatus =
    { receiverStatus | isMuted = mute }


setInputTv : Bool -> ReceiverStatus -> ReceiverStatus
setInputTv tv receiverStatus =
    { receiverStatus | isInputTv = tv }



-- DECODERS


receiverEventDecoder =
    D.field "tag" D.string
        |> D.andThen
            (\tag ->
                case tag of
                    "connected" ->
                        D.succeed EventConneted

                    "status" ->
                        D.field "data" receiverStatusDecoder

                    "tv" ->
                        D.field "data" receiverInputTvDecoder

                    "volume" ->
                        D.field "data" receiverVolumeDecoder

                    "mute" ->
                        D.field "data" receiverMuteDecoder

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


receiverVolumeDecoder : D.Decoder ReceiverEvent
receiverVolumeDecoder =
    D.int
        |> D.map EventVolume


receiverInputTvDecoder : D.Decoder ReceiverEvent
receiverInputTvDecoder =
    D.bool
        |> D.map EventInputTv


receiverMuteDecoder : D.Decoder ReceiverEvent
receiverMuteDecoder =
    D.bool
        |> D.map EventMute



-- VIEW


view : Model -> Browser.Document msg
view model =
    let
        { power, tv, volume, mute, connectionStatus } =
            case model.status of
                Status receiverStatus ->
                    { power =
                        if receiverStatus.isPowerOn then
                            "ON"

                        else
                            "OFF"
                    , tv =
                        if receiverStatus.isInputTv then
                            "ON"

                        else
                            "OFF"
                    , volume = String.fromInt receiverStatus.volume
                    , mute =
                        if receiverStatus.isMuted then
                            "ON"

                        else
                            "OFF"
                    , connectionStatus = "Let's do this!"
                    }

                _ ->
                    { power = "Unkown"
                    , tv = "Unknown"
                    , volume = "Unknown"
                    , mute = "Unknown"
                    , connectionStatus = "Waiting for status"
                    }
    in
    Browser.Document "MusicCast Remote"
        [ main_
            [ Attrib.class "" ]
            [ div [] [ text ("Connection: " ++ connectionStatus) ]
            , div [] [ text ("Error: " ++ Maybe.withDefault "No errors" model.error) ]
            , div [] [ text ("Power status: " ++ power) ]
            , div [] [ text ("Input TV: " ++ tv) ]
            , div [] [ text ("Muted: " ++ mute) ]
            , div [] [ text ("Volume: " ++ volume) ]
            ]
        ]



-- MAIN


main =
    Browser.document
        { init = init
        , view = view
        , update = update
        , subscriptions = subscriptions
        }

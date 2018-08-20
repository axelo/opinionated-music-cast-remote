module Main exposing (main)

import Browser
import Html exposing (Html, div, main_, text)
import Html.Attributes as Attrib
import Http
import Json.Decode as D
import Ports exposing (receiverEvent)



-- MODEL


type alias Model =
    { status : Status
    , error : Maybe String
    }


type Msg
    = ReceiverEventError String
    | GotReceiverEvent ReceiverEvent


type Status
    = WaitingForConnection
    | WaitingForStatus
    | Status ReceiverStatus


type ReceiverEvent
    = EventConneted
    | EventStatus ReceiverStatus
    | EventVolume Int
    | EventMute Bool
    | EventInputTv Bool
    | EventUnkown String


type alias ReceiverStatus =
    { isPowerOn : Bool
    , isInputTv : Bool
    , isMuted : Bool
    , volume : Int
    }



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
        GotReceiverEvent event ->
            case event of
                EventConneted ->
                    ( { model | status = WaitingForStatus }, Cmd.none )

                EventStatus status ->
                    ( { model | status = Status status }, Cmd.none )

                EventVolume volume ->
                    ( { model | status = setStatus model.status (\rs -> { rs | volume = volume }) }, Cmd.none )

                EventMute isMuted ->
                    ( { model | status = setStatus model.status (\rs -> { rs | isMuted = isMuted }) }, Cmd.none )

                EventInputTv isInputTv ->
                    ( { model | status = setStatus model.status (\rs -> { rs | isInputTv = isInputTv }) }, Cmd.none )

                EventUnkown tag ->
                    ( { model | error = Just ("Unknown receiver event '" ++ tag ++ "'") }, Cmd.none )

        ReceiverEventError error ->
            ( { model | error = Just error }, Cmd.none )


subscriptions _ =
    receiverEvent
        (\outside ->
            case D.decodeValue receiverEventDecoder outside of
                Ok event ->
                    GotReceiverEvent event

                Err err ->
                    ReceiverEventError (D.errorToString err)
        )



-- HELPERS


setStatus : Status -> (ReceiverStatus -> ReceiverStatus) -> Status
setStatus status setter =
    case status of
        Status receiverStatus ->
            Status (setter receiverStatus)

        _ ->
            status



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

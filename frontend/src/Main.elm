module Main exposing (main)

import Browser
import Html exposing (Html, button, div, footer, header, img, main_, section, span, text)
import Html.Attributes exposing (alt, class, src, type_)
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
    | Disconnected
    | Status ReceiverStatus


type ReceiverEvent
    = EventConneted
    | EventDisconnected
    | EventStatus ReceiverStatus
    | EventVolume Int
    | EventMute Bool
    | EventInputTv Bool
    | EventPower Bool
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

                EventDisconnected ->
                    ( { model | status = Disconnected }, Cmd.none )

                EventStatus status ->
                    ( { model | status = Status status }, Cmd.none )

                EventVolume volume ->
                    ( { model | status = setStatus model.status (\rs -> { rs | volume = volume }) }, Cmd.none )

                EventMute isMuted ->
                    ( { model | status = setStatus model.status (\rs -> { rs | isMuted = isMuted }) }, Cmd.none )

                EventInputTv isInputTv ->
                    ( { model | status = setStatus model.status (\rs -> { rs | isInputTv = isInputTv }) }, Cmd.none )

                EventPower isPowerOn ->
                    ( { model | status = setStatus model.status (\rs -> { rs | isPowerOn = isPowerOn }) }, Cmd.none )

                EventUnkown tag ->
                    ( { model | error = Just ("Unknown receiver event '" ++ tag ++ "'") }, Cmd.none )

        ReceiverEventError error ->
            ( { model | error = Just error }, Cmd.none )


subscriptions : Model -> Sub Msg
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


asHeaderIndicators status =
    case status of
        Status { isPowerOn, isMuted, isInputTv } ->
            { isPowerOn = isPowerOn, isMuted = isMuted, isInputTv = isInputTv }

        _ ->
            { isPowerOn = False, isMuted = False, isInputTv = False }


getVolume status =
    case status of
        Status { volume } ->
            Just volume

        _ ->
            Nothing



-- DECODERS


receiverEventDecoder : D.Decoder ReceiverEvent
receiverEventDecoder =
    D.field "tag" D.string
        |> D.andThen
            (\tag ->
                case tag of
                    "connected" ->
                        D.succeed EventConneted

                    "disconnected" ->
                        D.succeed EventDisconnected

                    "status" ->
                        D.field "data" receiverStatusDecoder

                    "tv" ->
                        D.field "data" (D.map EventInputTv D.bool)

                    "volume" ->
                        D.field "data" (D.map EventVolume D.int)

                    "mute" ->
                        D.field "data" (D.map EventMute D.bool)

                    "power" ->
                        D.field "data" (D.map EventPower D.bool)

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



-- VIEW


view : Model -> Browser.Document msg
view model =
    Browser.Document "MusicCast Remote"
        [ main_ [ class "main" ]
            [ viewHeader (asHeaderIndicators model.status)
            , section [ class "section section-source" ] [ viewSourceButton ]
            , viewVolumeSection (getVolume model.status)
            , footer [ class "footer" ] [ text "yamaha" ]
            ]
        ]


viewHeader { isPowerOn, isMuted, isInputTv } =
    header [ class "header" ]
        [ viewHeaderIndicator "power" "bg-red" "bg-green" isPowerOn
        , viewHeaderIndicator "tv" "" "bg-green" isInputTv
        , viewHeaderIndicator "mute" "" "bg-green" isMuted
        , viewPowerButton
        ]


viewHeaderIndicator caption inactiveClass activeClass isActive =
    div [ class "header-indicator" ]
        [ div
            [ class
                ("small-square "
                    ++ (if isActive then
                            activeClass

                        else
                            inactiveClass
                       )
                )
            ]
            []
        , text caption
        ]


viewPowerButton =
    button [ type_ "button", class "button power-button" ]
        [ img [ src "iconPower.svg" ] [] ]


viewSourceButton =
    div [ class "source-button-container" ]
        [ button [ type_ "button", class "button source-button" ] []
        , span [] [ text "tv" ]
        ]


viewVolumeSection volume =
    section [ class "section section-volume" ]
        [ div [ class "volume-container" ]
            [ viewVolumeButton "iconPlus.svg" "Volume up"
            , viewVolumeValue volume
            , viewVolumeButton "iconMinus.svg" "Volume down"
            , viewVolumeLines
            , div [ class "volume-section-fake-mute-height" ] []
            ]
        , viewMuteButton
        ]


viewVolumeButton srcUrl altText =
    div [ class "volume-button-container" ]
        [ div [ class "volume-button-inner-container" ]
            [ button [ type_ "button", class "button volume-button" ]
                [ img [ src srcUrl, alt altText ] [] ]
            ]
        ]


viewVolumeValue : Maybe Int -> Html msg
viewVolumeValue volume =
    div [ class "volume-value" ]
        [ text ("volume " ++ Maybe.withDefault "" (Maybe.map String.fromInt volume) ++ "%") ]


viewVolumeLines =
    div [ class "volume-lines" ] []


viewMuteButton =
    div [ class "mute-button-container" ]
        [ button [ type_ "button", class "button mute-button" ] []
        , text "mute"
        ]



-- MAIN


main =
    Browser.document
        { init = init
        , view = view
        , update = update
        , subscriptions = subscriptions
        }

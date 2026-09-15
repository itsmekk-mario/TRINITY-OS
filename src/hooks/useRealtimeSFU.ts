import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';

import {
  Room,
  RoomEvent,
  Track,
  type RemoteParticipant,
  type RemoteTrack,
  type RemoteTrackPublication,
} from 'livekit-client';

import {
  createLiveKitAccess,
  type ConnectionState,
  type StudyParticipant,
} from '../lib/studyRoom';

export function useRealtimeSFU(
  code: string,
  selfId: string,
  presenceConnectionId: string,
  participants: StudyParticipant[],
  localStream?: MediaStream,
) {
  const [ready, setReady] = useState(false);

  const [generation, setGeneration] =
    useState(0);

  const [
    connectionState,
    setConnectionState,
  ] = useState<ConnectionState>(
    'connecting',
  );

  const [error, setError] =
    useState('');

  const [
    remoteStreams,
    setRemoteStreams,
  ] = useState<Map<string, MediaStream>>(
    () => new Map(),
  );

  const roomRef =
    useRef<Room | undefined>(
      undefined,
    );

  const publishedTrackRef =
    useRef<MediaStreamTrack | undefined>(
      undefined,
    );

  const manualDisconnectRef =
    useRef(false);

  /**
   * LiveKit Room과 로컬 publication을 정리한다.
   *
   * stopTracks=true이므로 페이지 자체를 완전히 떠날 때는
   * LiveKit이 관리 중인 local track도 정리한다.
   */
  const disconnect =
    useCallback(() => {
      manualDisconnectRef.current = true;

      const room = roomRef.current;

      roomRef.current = undefined;
      publishedTrackRef.current =
        undefined;

      setReady(false);
      setConnectionState('offline');
      setRemoteStreams(new Map());

      if (room) {
        void room
          .disconnect(true)
          .catch(() => undefined);
      }
    }, []);

  /**
   * LiveKit Room 연결
   */
  useEffect(() => {
    if (
      !code ||
      !selfId ||
      !presenceConnectionId
    ) {
      return;
    }

    let disposed = false;
    let reconnectTimer:
      | number
      | undefined;

    manualDisconnectRef.current =
      false;

    setReady(false);
    setError('');
    setConnectionState('connecting');

    const room = new Room({
      /**
       * 화면에서 실제로 보이는 remote video의 품질을
       * LiveKit이 자동 조절할 수 있게 한다.
       */
      adaptiveStream: true,

      /**
       * 필요하지 않은 simulcast layer 송출을
       * LiveKit이 줄일 수 있게 한다.
       */
      dynacast: true,

      /**
       * localStream lifecycle은 기존 useCamera가
       * 주로 담당하므로 unpublish 자체만으로
       * 원본 MediaStreamTrack을 종료하지 않는다.
       */
      stopLocalTrackOnUnpublish: false,

      /**
       * LiveKit 자체 PeerConnection은
       * 가능한 경우 single-PC 모드를 사용한다.
       */
      singlePeerConnection: true,

      publishDefaults: {
        simulcast: true,

        videoEncoding: {
          maxBitrate: 500_000,
          maxFramerate: 15,
        },
      },
    });

    roomRef.current = room;

    const removeParticipantStream = (
      participantId: string,
    ) => {
      setRemoteStreams((current) => {
        if (!current.has(participantId)) {
          return current;
        }

        const next = new Map(current);
        next.delete(participantId);

        return next;
      });
    };

    const handleTrackSubscribed = (
      track: RemoteTrack,
      _publication: RemoteTrackPublication,
      participant: RemoteParticipant,
    ) => {
      if (
        track.kind !== Track.Kind.Video
      ) {
        return;
      }

      /**
       * 기존 TRINITY UI는 MediaStream을 기대하므로
       * LiveKit RemoteTrack의 실제 MediaStreamTrack을
       * MediaStream으로 감싼다.
       */
      const stream = new MediaStream([
        track.mediaStreamTrack,
      ]);

      setRemoteStreams((current) => {
        const next = new Map(current);

        next.set(
          participant.identity,
          stream,
        );

        return next;
      });
    };

    const handleTrackUnsubscribed = (
      track: RemoteTrack,
      _publication: RemoteTrackPublication,
      participant: RemoteParticipant,
    ) => {
      if (
        track.kind !== Track.Kind.Video
      ) {
        return;
      }

      removeParticipantStream(
        participant.identity,
      );
    };

    const handleParticipantDisconnected = (
      participant: RemoteParticipant,
    ) => {
      removeParticipantStream(
        participant.identity,
      );
    };

    const handleReconnecting = () => {
      if (disposed) return;

      setConnectionState(
        'reconnecting',
      );
    };

    const handleReconnected = () => {
      if (disposed) return;

      setConnectionState(
        'connected',
      );

      setError('');
    };

    const handleDisconnected = () => {
      if (disposed) return;

      setReady(false);
      setConnectionState(
        'offline',
      );

      /**
       * 사용자가 직접 방을 나간 것이 아니라
       * 완전히 연결이 종료된 경우에만
       * 새 LiveKit Room으로 다시 연결을 시도한다.
       *
       * LiveKit 내부 reconnect가 먼저 동작하므로
       * 여기까지 왔을 때만 fallback한다.
       */
      if (
        !manualDisconnectRef.current
      ) {
        reconnectTimer =
          window.setTimeout(() => {
            if (!disposed) {
              setGeneration(
                (value) => value + 1,
              );
            }
          }, 5_000);
      }
    };

    room.on(
      RoomEvent.TrackSubscribed,
      handleTrackSubscribed,
    );

    room.on(
      RoomEvent.TrackUnsubscribed,
      handleTrackUnsubscribed,
    );

    room.on(
      RoomEvent.ParticipantDisconnected,
      handleParticipantDisconnected,
    );

    room.on(
      RoomEvent.Reconnecting,
      handleReconnecting,
    );

    room.on(
      RoomEvent.Reconnected,
      handleReconnected,
    );

    room.on(
      RoomEvent.Disconnected,
      handleDisconnected,
    );

    void (async () => {
      try {
        /**
         * Worker에서:
         *
         * 1. 기존 TRINITY 로그인 검증
         * 2. Study Room membership 검증
         * 3. 최대 10명 정책 검증
         * 4. LiveKit JWT 생성
         *
         * 후 url/token만 브라우저에 반환한다.
         */
        const access =
          await createLiveKitAccess(
            code,
          );

        if (disposed) return;

        if (
          !access.url ||
          !access.token
        ) {
          throw new Error(
            'LiveKit 연결 정보가 올바르지 않습니다.',
          );
        }

        /**
         * 연결을 미리 준비해 초기 연결 지연을
         * 조금 줄인다.
         */
        room.prepareConnection(
          access.url,
          access.token,
        );

        await room.connect(
          access.url,
          access.token,
          {
            autoSubscribe: true,
          },
        );

        if (disposed) {
          await room.disconnect(true);
          return;
        }

        setReady(true);

        setConnectionState(
          'connected',
        );

        setError('');
      } catch (cause) {
        if (disposed) return;

        setReady(false);

        setConnectionState(
          'offline',
        );

        setError(
          cause instanceof Error
            ? cause.message
            : 'LiveKit 영상 세션을 시작하지 못했습니다.',
        );

        reconnectTimer =
          window.setTimeout(() => {
            if (!disposed) {
              setGeneration(
                (value) => value + 1,
              );
            }
          }, 5_000);
      }
    })();

    return () => {
      disposed = true;

      if (
        reconnectTimer !== undefined
      ) {
        window.clearTimeout(
          reconnectTimer,
        );
      }

      room.off(
        RoomEvent.TrackSubscribed,
        handleTrackSubscribed,
      );

      room.off(
        RoomEvent.TrackUnsubscribed,
        handleTrackUnsubscribed,
      );

      room.off(
        RoomEvent.ParticipantDisconnected,
        handleParticipantDisconnected,
      );

      room.off(
        RoomEvent.Reconnecting,
        handleReconnecting,
      );

      room.off(
        RoomEvent.Reconnected,
        handleReconnected,
      );

      room.off(
        RoomEvent.Disconnected,
        handleDisconnected,
      );

      if (
        roomRef.current === room
      ) {
        roomRef.current =
          undefined;
      }

      publishedTrackRef.current =
        undefined;

      void room
        .disconnect(true)
        .catch(() => undefined);
    };
  }, [
    code,
    generation,
    presenceConnectionId,
    selfId,
  ]);

  /**
   * 기존 useCamera가 만들어 준 MediaStream의
   * video track을 LiveKit에 publish/unpublish한다.
   *
   * getUserMedia는 여기서 호출하지 않는다.
   * 따라서 기존처럼 사용자가 CAM 버튼을 눌렀을 때만
   * 브라우저 카메라 권한 요청이 발생한다.
   */
  useEffect(() => {
    if (!ready) return;

    const room =
      roomRef.current;

    if (!room) return;

    let cancelled = false;

    void (async () => {
      try {
        const nextTrack =
          localStream
            ?.getVideoTracks()
            .find(
              (track) =>
                track.readyState ===
                'live',
            );

        const previousTrack =
          publishedTrackRef.current;

        /**
         * CAM OFF 또는 카메라 flip 등으로
         * track이 변경된 경우 이전 track을 먼저
         * SFU에서 내린다.
         */
        if (
          previousTrack &&
          previousTrack !== nextTrack
        ) {
          await room.localParticipant
            .unpublishTrack(
              previousTrack,
              false,
            )
            .catch(() => undefined);

          if (
            publishedTrackRef.current ===
            previousTrack
          ) {
            publishedTrackRef.current =
              undefined;
          }
        }

        /**
         * CAM OFF 상태.
         */
        if (!nextTrack) {
          return;
        }

        /**
         * 이미 같은 track이 publish되어 있으면
         * 중복 publish하지 않는다.
         */
        if (
          publishedTrackRef.current ===
          nextTrack
        ) {
          return;
        }

        await room.localParticipant.publishTrack(
          nextTrack,
          {
            name: `camera-${selfId}`,

            source:
              Track.Source.Camera,

            /**
             * 10명 캠스터디에서 subscriber 화면 크기에 따라
             * LiveKit이 적절한 layer를 선택할 수 있게 한다.
             */
            simulcast: true,

            videoEncoding: {
              maxBitrate: 500_000,
              maxFramerate: 15,
            },
          },
        );

        if (cancelled) {
          await room.localParticipant
            .unpublishTrack(
              nextTrack,
              false,
            )
            .catch(() => undefined);

          return;
        }

        publishedTrackRef.current =
          nextTrack;
      } catch (cause) {
        if (cancelled) return;

        setError(
          cause instanceof Error
            ? cause.message
            : '카메라 영상을 LiveKit에 publish하지 못했습니다.',
        );
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    localStream,
    ready,
    selfId,
  ]);

  /**
   * TRINITY presence에서 이미 퇴장한 사용자가
   * 남아 보이는 경우를 방지하는 보조 cleanup.
   */
  useEffect(() => {
    const active = new Set(
      participants.map(
        (participant) =>
          participant.id,
      ),
    );

    setRemoteStreams(
      (current) => {
        let changed = false;

        const next =
          new Map(current);

        for (const id of next.keys()) {
          if (!active.has(id)) {
            next.delete(id);
            changed = true;
          }
        }

        return changed
          ? next
          : current;
      },
    );
  }, [participants]);

  /**
   * LiveKit이 자체 reconnect를 먼저 수행한다.
   * 완전히 offline 상태가 된 뒤 브라우저가 다시 online이 되면
   * fallback 재연결을 시도한다.
   */
  useEffect(() => {
    const recover = () => {
      if (
        document.visibilityState ===
          'visible' &&
        connectionState ===
          'offline' &&
        !manualDisconnectRef.current
      ) {
        setGeneration(
          (value) => value + 1,
        );
      }
    };

    document.addEventListener(
      'visibilitychange',
      recover,
    );

    window.addEventListener(
      'online',
      recover,
    );

    return () => {
      document.removeEventListener(
        'visibilitychange',
        recover,
      );

      window.removeEventListener(
        'online',
        recover,
      );
    };
  }, [connectionState]);

  return {
    remoteStreams,
    connectionState,
    error,
    disconnect,
  };
}
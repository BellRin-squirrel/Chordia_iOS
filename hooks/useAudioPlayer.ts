import { useState, useRef, useEffect } from 'react';
import { Animated, Dimensions, Alert } from 'react-native';
import TrackPlayer, { State as RNTPState, usePlaybackState, useProgress, RepeatMode, Capability, AppKilledBehavior, Event } from 'react-native-track-player';
import { Audio, InterruptionModeIOS, InterruptionModeAndroid } from 'expo-av';
import AsyncStorage from '@react-native-async-storage/async-storage';

const { height } = Dimensions.get('window');

let isRNTPInitialized = false;

export const useAudioPlayer = () => {
  // ★ エンジンの状態 (デフォルトは rntp)
  const[audioEngine, setAudioEngine] = useState<'expo-av'|'rntp'>('rntp');

  const[isPlaying, setIsPlaying] = useState(false);
  const [currentSong, setCurrentSong] = useState<any>(null);
  const [playQueue, setPlayQueue] = useState<any[]>([]); 
  const[currentIndex, setCurrentIndex] = useState(0);
  const [loopMode, setLoopMode] = useState<'OFF' | 'ALL' | 'ONE'>('OFF');
  const [isShuffle, setIsShuffle] = useState(false);
  
  const [isFullPlayer, setIsFullPlayer] = useState(false);
  const [showQueue, setShowQueue] = useState(false);
  const [showLyrics, setShowLyrics] = useState(false);
  const [navStackLength, setNavStackLength] = useState(1);

  const [toastVisible, setToastVisible] = useState(false);
  const[toastMessage, setToastMessage] = useState('');
  const toastAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(height)).current;
  const queueTransitionAnim = useRef(new Animated.Value(0)).current;

  const originalQueueRef = useRef<any[]>([]);
  const currentSongRef = useRef<any>(null);
  const queueRef = useRef<any[]>([]);
  const indexRef = useRef<number>(0);
  const loopRef = useRef<any>('OFF');
  const shuffleRef = useRef<boolean>(false);
  
  // Expo-AV用のRefとState
  const soundRefExpo = useRef<Audio.Sound | null>(null);
  const[playbackStatusExpo, setPlaybackStatusExpo] = useState<any>(null);

  useEffect(() => { currentSongRef.current = currentSong; },[currentSong]);
  useEffect(() => { queueRef.current = playQueue; }, [playQueue]);
  useEffect(() => { indexRef.current = currentIndex; }, [currentIndex]);
  useEffect(() => { loopRef.current = loopMode; }, [loopMode]);
  useEffect(() => { shuffleRef.current = isShuffle; }, [isShuffle]);

  // ★ AsyncStorageからエンジン設定をロード
  useEffect(() => {
    AsyncStorage.getItem('audioEngine').then(val => {
      if (val === 'expo-av' || val === 'rntp') setAudioEngine(val);
    });
  },[]);

  // ★ エンジンの切り替え関数
  const changeAudioEngine = async (engine: 'expo-av'|'rntp') => {
    if (engine === audioEngine) return;
    setIsPlaying(false);
    
    // 現在の再生を強制停止
    if (audioEngine === 'rntp') {
      try { await TrackPlayer.stop(); await TrackPlayer.reset(); } catch(e){}
    } else if (soundRefExpo.current) {
      try { await soundRefExpo.current.unloadAsync(); soundRefExpo.current = null; } catch(e){}
    }
    
    setAudioEngine(engine);
    await AsyncStorage.setItem('audioEngine', engine);
    setPlayQueue([]);
    setCurrentSong(null);
    Alert.alert("設定変更", "再生エンジンを切り替えました。");
  };

  // 【初期化】Expo-AV (MixWithOthersで干渉回避)
  useEffect(() => {
    const initExpoAv = async () => {
      try {
        await Audio.setAudioModeAsync({
          playsInSilentModeIOS: true,
          staysActiveInBackground: true,
          interruptionModeIOS: InterruptionModeIOS.MixWithOthers, // ★ これが他アプリと干渉させない設定
          interruptionModeAndroid: InterruptionModeAndroid.DuckOthers,
          shouldDuckAndroid: true,
          playThroughEarpieceAndroid: false,
        });
      } catch (e) { console.warn("Expo-AV init failed", e); }
    };
    initExpoAv();
  },[]);

  // 【初期化】RNTP (ロック画面コントロール用)
  useEffect(() => {
    const initRNTP = async () => {
      if (isRNTPInitialized) return;
      try {
        await TrackPlayer.setupPlayer();
        await TrackPlayer.updateOptions({
          android: { appKilledBehavior: 'StopPlaybackAndRemoveNotification' as any },
          capabilities:[ Capability.Play, Capability.Pause, Capability.SkipToNext, Capability.SkipToPrevious, Capability.SeekTo ],
          compactCapabilities:[Capability.Play, Capability.Pause, Capability.SkipToNext],
        });
        isRNTPInitialized = true;
      } catch (e) { console.log("RNTP setup error:", e); }
    };
    initRNTP();
  },[]);

  // ---------------------------------------------------------
  // 状態の統合
  // ---------------------------------------------------------
  const rntpState = usePlaybackState();
  const rntpProgress = useProgress(250); 

  const playbackStatus = audioEngine === 'rntp' ? {
    positionMillis: rntpProgress.position * 1000,
    durationMillis: rntpProgress.duration * 1000,
  } : playbackStatusExpo;

  useEffect(() => {
    if (audioEngine === 'rntp') {
      if (rntpState.state === RNTPState.Playing) setIsPlaying(true);
      else if (rntpState.state === RNTPState.Paused || rntpState.state === RNTPState.Stopped) setIsPlaying(false);
    }
  },[rntpState.state, audioEngine]);

  const showToast = (message: string) => {
    if (toastVisible) return;
    setToastMessage(message);
    setToastVisible(true);
    Animated.timing(toastAnim, { toValue: 1, duration: 300, useNativeDriver: true }).start(() => {
      setTimeout(() => {
        Animated.timing(toastAnim, { toValue: 0, duration: 300, useNativeDriver: true }).start(() => {
          setToastVisible(false);
        });
      }, 2000);
    });
  };

  const rebuildQueue = (current: any, shuffle: boolean, loop: any, original: any[]) => {
    if (loop === 'ONE' || !current) return[]; 
    if (shuffle) {
      const others = original.filter(s => s.localMusicUri !== current.localMusicUri);
      return others.sort(() => Math.random() - 0.5);
    } else {
      const idx = original.findIndex(s => s.localMusicUri === current.localMusicUri);
      if (idx !== -1) return original.slice(idx + 1);
      return[];
    }
  };

  const saveHistory = async (song: any) => {
    try {
      const rs = await AsyncStorage.getItem('recently_played_songs');
      let list = rs ? JSON.parse(rs) : [];
      list =[song, ...list.filter((s: any) => s.localMusicUri !== song.localMusicUri)].slice(0, 10);
      await AsyncStorage.setItem('recently_played_songs', JSON.stringify(list));
    } catch(e){}
  };

  // ★ 再生ロジック（エンジン分岐）
  const loadAndPlayInternal = async (song: any, queue: any[] =[], startIndex: number = 0) => {
    try {
      if (audioEngine === 'rntp') {
        await TrackPlayer.reset();
        const tracks = queue.map(s => ({
          id: s.localMusicUri, url: s.localMusicUri, title: s.title || 'Unknown', artist: s.artist || 'Unknown',
          artwork: s.localImageUri || require('../assets/images/icon.png'), originalData: s
        }));
        await TrackPlayer.add(tracks);
        await TrackPlayer.skip(startIndex);
        await TrackPlayer.play();
        
        setCurrentSong(queue[startIndex]);
        const appQueue = queue.slice(startIndex + 1);
        setPlayQueue(appQueue);
        queueRef.current = appQueue;
        setCurrentIndex(startIndex);
        saveHistory(queue[startIndex]);

      } else {
        // Expo-AV の場合
        if (soundRefExpo.current) await soundRefExpo.current.unloadAsync();
        const isLoopOne = loopRef.current === 'ONE';
        const { sound: newSound } = await Audio.Sound.createAsync(
          { uri: song.localMusicUri }, 
          { shouldPlay: true, isLooping: isLoopOne },
          (status: any) => {
            if (!status.isLoaded) return;
            setPlaybackStatusExpo(status);
            setIsPlaying(status.isPlaying);
            if (status.didJustFinish && !status.isLooping) {
              handleNextInternal(); // 曲が終わったら自前で次へ
            }
          }
        );
        soundRefExpo.current = newSound;
        setCurrentSong(song);
        saveHistory(song);
      }
    } catch (e) {
      Alert.alert("エラー", "再生に失敗しました");
    }
  };

  const startQueue = (songs: any[], selectedSong?: any | null, forceShuffle?: boolean) => {
    if (songs.length === 0) return;
    originalQueueRef.current = [...songs];
    const newShuffle = forceShuffle !== undefined ? forceShuffle : isShuffle;
    setIsShuffle(newShuffle);
    shuffleRef.current = newShuffle;

    let firstSong = selectedSong;
    if (!firstSong) {
        if (newShuffle) {
            const shuffled = [...songs].sort(() => Math.random() - 0.5);
            firstSong = shuffled[0];
        } else {
            firstSong = songs[0];
        }
    }

    let finalQueue = [...songs];
    let targetIndex = 0;
    if (newShuffle) {
      const newQ = rebuildQueue(firstSong, newShuffle, loopRef.current, songs);
      finalQueue = [firstSong, ...newQ];
      targetIndex = 0;
    } else {
      targetIndex = finalQueue.findIndex(s => s.localMusicUri === firstSong.localMusicUri);
      if (targetIndex === -1) targetIndex = 0;
    }

    if (audioEngine === 'expo-av') {
      const newQueue = rebuildQueue(firstSong, newShuffle, loopRef.current, songs);
      setPlayQueue(newQueue);
      queueRef.current = newQueue;
      loadAndPlayInternal(firstSong);
    } else {
      loadAndPlayInternal(finalQueue, finalQueue, targetIndex);
    }
  };

  const toggleShuffleMode = () => {
    const nextShuffle = !isShuffle;
    setIsShuffle(nextShuffle);
    shuffleRef.current = nextShuffle;
    
    if (!currentSongRef.current) return;
    const remaining = originalQueueRef.current.filter(s => s.localMusicUri !== currentSongRef.current.localMusicUri);
    let newQueue =[];

    if (nextShuffle) {
        const shuffled = remaining.sort(() => Math.random() - 0.5);
        newQueue = [currentSongRef.current, ...shuffled];
    } else {
        newQueue = [...originalQueueRef.current];
    }

    if (audioEngine === 'rntp') {
      const idx = nextShuffle ? 0 : newQueue.findIndex(s => s.localMusicUri === currentSongRef.current.localMusicUri);
      loadAndPlayInternal(newQueue, newQueue, idx !== -1 ? idx : 0);
    } else {
      const expoQueue = rebuildQueue(currentSongRef.current, nextShuffle, loopRef.current, originalQueueRef.current);
      setPlayQueue(expoQueue);
      queueRef.current = expoQueue;
    }
  };

  const toggleLoopMode = async () => {
    const modes: ('OFF' | 'ALL' | 'ONE')[] = ['OFF', 'ALL', 'ONE'];
    const nextLoop = modes[(modes.indexOf(loopMode) + 1) % 3];
    setLoopMode(nextLoop);
    loopRef.current = nextLoop;
    
    if (audioEngine === 'rntp') {
      if (nextLoop === 'ONE') await TrackPlayer.setRepeatMode(RepeatMode.Track);
      else if (nextLoop === 'ALL') await TrackPlayer.setRepeatMode(RepeatMode.Queue);
      else await TrackPlayer.setRepeatMode(RepeatMode.Off);
    } else {
      // expo-av の 1曲ループは即時反映
      if (soundRefExpo.current) await soundRefExpo.current.setIsLoopingAsync(nextLoop === 'ONE');
    }
    
    if (currentSongRef.current) {
        const newQueue = rebuildQueue(currentSongRef.current, shuffleRef.current, nextLoop, originalQueueRef.current);
        setPlayQueue(newQueue);
        queueRef.current = newQueue;
    }
  };

  const handleNextInternal = async () => {
    if (audioEngine === 'rntp') {
      await TrackPlayer.skipToNext();
    } else {
      const queue = queueRef.current;
      const mode = loopRef.current;
      const original = originalQueueRef.current;

      if (mode === 'ONE' && currentSongRef.current) {
        loadAndPlayInternal(currentSongRef.current);
        return;
      }
      if (queue.length > 0) {
        const nextSong = queue[0];
        const remainingQueue = queue.slice(1);
        setPlayQueue(remainingQueue);
        queueRef.current = remainingQueue;
        loadAndPlayInternal(nextSong);
      } else {
        if (mode === 'ALL' && original.length > 0) {
          let firstSong;
          let newQueue;
          if (shuffleRef.current) {
              const shuffled = [...original].sort(() => Math.random() - 0.5);
              firstSong = shuffled[0];
              newQueue = shuffled.slice(1);
          } else {
              firstSong = original[0];
              newQueue = original.slice(1);
          }
          setPlayQueue(newQueue);
          queueRef.current = newQueue;
          loadAndPlayInternal(firstSong);
        } else {
          setIsPlaying(false);
        }
      }
    }
  };

  const handleNext = () => handleNextInternal();
  
  const handlePrev = async () => {
    if (audioEngine === 'rntp') {
      const currentPos = await TrackPlayer.getPosition();
      if (currentPos > 3) await TrackPlayer.seekTo(0);
      else await TrackPlayer.skipToPrevious();
    } else {
      const current = currentSongRef.current;
      const original = originalQueueRef.current;
      if (!current || original.length === 0) return;

      if (playbackStatusExpo?.positionMillis > 3000) {
        soundRefExpo.current?.setPositionAsync(0);
        return;
      }

      const idx = original.findIndex(s => s.localMusicUri === current.localMusicUri);
      let prevSong = original[0];
      if (idx > 0) prevSong = original[idx - 1];
      else if (loopRef.current === 'ALL') prevSong = original[original.length - 1];
      
      const newQueue = rebuildQueue(prevSong, shuffleRef.current, loopRef.current, original);
      setPlayQueue(newQueue);
      queueRef.current = newQueue;
      loadAndPlayInternal(prevSong);
    }
  };

  const togglePlayPause = async () => {
    if (audioEngine === 'rntp') {
      const state = await TrackPlayer.getState();
      if (state === RNTPState.Playing) await TrackPlayer.pause();
      else await TrackPlayer.play();
    } else {
      const currentSound = soundRefExpo.current;
      if (!currentSound) return;
      if (isPlaying) await currentSound.pauseAsync();
      else await currentSound.playAsync();
    }
  };

  const setPositionAsync = async (v: number) => {
    if (audioEngine === 'rntp') {
      await TrackPlayer.seekTo(v / 1000);
    } else {
      await soundRefExpo.current?.setPositionAsync(v);
    }
  };

  const closeFullPlayer = () => {
    Animated.timing(slideAnim, { toValue: height, duration: 250, useNativeDriver: true }).start(() => { 
        setIsFullPlayer(false); setShowQueue(false); setShowLyrics(false); queueTransitionAnim.setValue(0);
    });
  };

  useEffect(() => {
    const sub = TrackPlayer.addEventListener(Event.PlaybackActiveTrackChanged, async (event) => {
        if (audioEngine === 'rntp' && event.track && event.track.originalData) {
            setCurrentSong(event.track.originalData);
            currentSongRef.current = event.track.originalData;
            
            const mode = loopRef.current;
            const original = originalQueueRef.current;
            if (mode !== 'ONE') {
               const newQueue = rebuildQueue(event.track.originalData, shuffleRef.current, mode, original);
               setPlayQueue(newQueue);
               queueRef.current = newQueue;
            }
        }
    });
    return () => sub.remove();
  }, [audioEngine]);

  return { 
    sound: { setPositionAsync },
    audioEngine, changeAudioEngine, // ★ UI側に渡す
    isPlaying, currentSong, playbackStatus, playQueue, currentIndex, 
    loopMode, toggleLoopMode, isShuffle, toggleShuffleMode, isFullPlayer, setIsFullPlayer, 
    showQueue, setShowQueue, showLyrics, setShowLyrics, 
    toastVisible, toastMessage, toastAnim, showToast,
    navStackLength, setNavStackLength,
    startQueue, loadAndPlay: (song:any) => startQueue([song], song, false), handleNext, handlePrev, togglePlayPause, 
    slideAnim, queueTransitionAnim, closeFullPlayer 
  };
};
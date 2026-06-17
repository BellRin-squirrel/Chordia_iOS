import React, { useRef, useState, useEffect } from 'react';
import { View, Text, Image, TouchableOpacity, Animated, ScrollView, FlatList, StyleSheet, PanResponder, useWindowDimensions, Easing, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import Slider from '@react-native-community/slider';
import { styles } from '../styles/styles';

const DEFAULT_ICON = require('../assets/images/icon.png');

const MarqueeText = ({ text, style, containerWidth }: { text: string, style: any, containerWidth: number }) => {
  const scrollAnim = useRef(new Animated.Value(0)).current;
  const [textWidth, setTextWidth] = useState(0);
  const[shouldScroll, setShouldScroll] = useState(false);

  useEffect(() => {
    if (textWidth > containerWidth && containerWidth > 0) {
      setShouldScroll(true);
      startAnimation();
    } else {
      setShouldScroll(false);
      scrollAnim.setValue(0);
    }
  },[text, textWidth, containerWidth]);

  const startAnimation = () => {
    scrollAnim.setValue(0);
    const duration = textWidth * 30;
    Animated.loop(
      Animated.sequence([
        Animated.delay(3000),
        Animated.timing(scrollAnim, {
          toValue: -textWidth - 40,
          duration: duration,
          easing: Easing.linear,
          useNativeDriver: true,
        }),
      ])
    ).start();
  };

  if (!text) return null;

  return (
    <View style={{ width: containerWidth, overflow: 'hidden' }}>
      <Animated.View style={{ flexDirection: 'row', transform:[{ translateX: scrollAnim }] }}>
        <Text style={style} onLayout={(e) => setTextWidth(e.nativeEvent.layout.width)} numberOfLines={1}>{text}</Text>
        {shouldScroll && <Text style={[style, { marginLeft: 40 }]}>{text}</Text>}
      </Animated.View>
    </View>
  );
};

export const FullScreenPlayer = ({ 
  dynamicStyles, themeColor, currentSong, isPlaying, playbackStatus, sound, 
  playQueue, loopMode, isShuffle, showQueue, showLyrics, 
  toggleLoopMode, toggleShuffleMode, setShowQueue, setShowLyrics,
  handlePrev, togglePlayPause, handleNext, 
  slideAnim, queueTransitionAnim, closeFullPlayer,
  toastVisible, toastMessage, toastAnim
}: any) => {

  const { width, height } = useWindowDimensions();
  const isLandscape = width > height;

  const transitionAnim = useRef(new Animated.Value(0)).current;
  const scrollYRef = useRef(0);
  const maxDyRef = useRef(0);

  useEffect(() => {
    const toValue = (showLyrics || showQueue) ? 1 : 0;
    Animated.spring(transitionAnim, {
      toValue,
      useNativeDriver: false,
      friction: 8,
      tension: 40
    }).start();
  }, [showLyrics, showQueue]);

  useEffect(() => {
    scrollYRef.current = 0;
    maxDyRef.current = 0;
  }, [showLyrics, showQueue]);

  // ★ 修正1: 同僚エンジニアの推奨に基づく通常フェーズ(Start/Move)での完璧なジェスチャーコントロール
  const panResponder = useRef(PanResponder.create({
    onStartShouldSetPanResponderCapture: () => false,
    onMoveShouldSetPanResponderCapture: () => false, // Captureは使用せず通常フェーズに一任
    
    // 1. タッチ開始時に応答候補として登録 (画面全体のどこを触っても候補に選定)
    onStartShouldSetPanResponder: () => {
      console.log("start");
      return true;
    },
    
    // 2. 指を動かした時に「スクロール最上部」かつ「下スワイプ」ならコントロールを正式獲得
    onMoveShouldSetPanResponder: (_, g) => {
      console.log("move check", "dy:", g.dy, "dx:", g.dx);
      const isScrollAtTop = scrollYRef.current <= 0;
      
      if (isScrollAtTop && g.dy > 8 && Math.abs(g.dy) > Math.abs(g.dx) * 1.5) {
        console.log("move success");
        return true; 
      }
      return false; 
    },

    onPanResponderGrant: () => {
      console.log("grant"); 
    },
    onPanResponderReject: () => {
      console.log("reject"); 
    },
    
    onPanResponderMove: (_, g) => {
      console.log("move active", g.dy); 
      maxDyRef.current = Math.max(maxDyRef.current, g.dy);
      if (g.dy > 0) slideAnim.setValue(g.dy);
    },
    
    onPanResponderRelease: (_, g) => {
      console.log("release", g.dy, "maxDy:", maxDyRef.current, "startY0:", g.y0); 
      
      // タッチ開始位置が最上部（y0 < 80px）のバー領域だった場合は無条件クローズ（タップ・微小スワイプに対応）
      const isBarTouched = g.y0 < 80;
      
      if (maxDyRef.current > 120 || g.vy > 0.5 || isBarTouched) {
        console.log("close"); 
        closeFullPlayer();
      } else {
        console.log("cancel"); 
        Animated.spring(slideAnim, { toValue: 0, useNativeDriver: true }).start();
      }
      maxDyRef.current = 0;
    },
    
    onPanResponderTerminate: () => {
      console.log("terminate");
      maxDyRef.current = 0;
      Animated.spring(slideAnim, { toValue: 0, useNativeDriver: true }).start();
    },
    onPanResponderTerminationRequest: () => true, 
    onShouldBlockNativeResponder: () => true,
  })).current;

  const formatMillis = (ms: number | undefined) => { if (!ms) return "0:00"; const totalSec = Math.floor(ms / 1000); const min = Math.floor(totalSec / 60); const sec = totalSec % 60; return `${min}:${sec < 10 ? '0' : ''}${sec}`; };
  
  const toggleLyrics = () => { 
    if (showQueue) setShowQueue(false);
    setShowLyrics(!showLyrics); 
  };

  const toggleQueue = () => {
    if (showLyrics) setShowLyrics(false);
    setShowQueue(!showQueue);
  };

  const renderControls = (iconSize: number, customStyle?: any) => (
    <View style={[styles.fullControls, customStyle]}>
      <TouchableOpacity onPress={handlePrev}><Ionicons name="play-skip-back" size={35} color="#fff" /></TouchableOpacity>
      <TouchableOpacity onPress={togglePlayPause}><Ionicons name={isPlaying ? "pause-circle" : "play-circle"} size={iconSize} color="#fff" /></TouchableOpacity>
      <TouchableOpacity onPress={handleNext}><Ionicons name="play-skip-forward" size={35} color="#fff" /></TouchableOpacity>
    </View>
  );

  const renderQueueToggles = () => (
    <View style={[styles.queueTogglesWrapper, { marginBottom: 15 }]}>
      <TouchableOpacity style={[styles.toggleBtnSplit, styles.toggleLeft, { backgroundColor: isShuffle ? themeColor : 'rgba(255,255,255,0.1)' }]} onPress={toggleShuffleMode}><Ionicons name="shuffle" size={24} color="#fff" /></TouchableOpacity>
      <View style={styles.toggleDivider} />
      <TouchableOpacity style={[styles.toggleBtnSplit, styles.toggleRight, { backgroundColor: loopMode !== 'OFF' ? themeColor : 'rgba(255,255,255,0.1)' }]} onPress={toggleLoopMode}><Ionicons name={loopMode === 'ONE' ? "repeat-outline" : "repeat"} size={24} color="#fff" />{loopMode === 'ONE' && <Text style={styles.oneBadgeInline}>1</Text>}</TouchableOpacity>
    </View>
  );

  const mainOpacity = transitionAnim.interpolate({ inputRange: [0, 0.5, 1], outputRange: [1, 0, 0] });
  const subViewOpacity = transitionAnim.interpolate({ inputRange:[0, 0.5, 1], outputRange: [0, 0, 1] });
  const mainTranslateX = transitionAnim.interpolate({ inputRange: [0, 1], outputRange: [0, -30] });
  const subViewTranslateX = transitionAnim.interpolate({ inputRange: [0, 1], outputRange:[30, 0] });

  let contentLayout;
  if (isLandscape) {
    const leftColumnWidth = (width / 2.2) - 50;

    contentLayout = (
      <View style={{ flexDirection: 'row', flex: 1 }}>
        <View style={{ width: 50, justifyContent: 'center', alignItems: 'center' }}>
          <TouchableOpacity onPress={toggleLyrics}>
            <Ionicons name="musical-notes-outline" size={28} color={showLyrics ? themeColor : "rgba(255,255,255,0.6)"} />
          </TouchableOpacity>
        </View>
        <View style={{ width: leftColumnWidth, padding: 15, justifyContent: 'center' }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 30 }}>
            {/* 画像単体の pointerEvents もデフォルトに戻す */}
            <Image 
              source={currentSong?.localImageUri ? {uri: currentSong.localImageUri} : DEFAULT_ICON} 
              style={{ width: 80, height: 80, borderRadius: 10 }} 
            />
            <View style={{ marginLeft: 15, flex: 1 }}>
              <MarqueeText text={currentSong?.title} style={{ color: '#fff', fontSize: 18, fontWeight: 'bold' }} containerWidth={leftColumnWidth - 110} />
              <MarqueeText text={currentSong?.artist} style={{ color: 'rgba(255,255,255,0.6)', fontSize: 14, marginTop: 4 }} containerWidth={leftColumnWidth - 110} />
            </View>
          </View>
          <View style={{ width: '100%' }}>
            <View style={styles.sliderWithTime}>
              <Slider style={{width: '100%', height: 40}} minimumValue={0} maximumValue={playbackStatus?.durationMillis || 100} value={playbackStatus?.positionMillis || 0} minimumTrackTintColor={themeColor} maximumTrackTintColor="rgba(255,255,255,0.3)" thumbTintColor="#fff" onSlidingComplete={v => sound?.setPositionAsync(v)} />
              <View style={styles.timeRow}><Text style={styles.timeLabel}>{formatMillis(playbackStatus?.positionMillis)}</Text><Text style={styles.timeLabel}>{formatMillis(playbackStatus?.durationMillis)}</Text></View>
            </View>
            {renderControls(70, { width: '100%', marginTop: 20, justifyContent: 'space-around' })}
          </View>
        </View>
        <View style={{ width: 1, backgroundColor: 'rgba(255,255,255,0.1)', marginVertical: 30 }} />
        <View style={{ flex: 1, overflow: 'hidden' }}>
          <Animated.View style={[StyleSheet.absoluteFill, { padding: 20, opacity: mainOpacity, transform: [{ translateX: mainTranslateX }] }]} pointerEvents={showLyrics ? 'none' : 'auto'}>
            {renderQueueToggles()}
            <FlatList 
              data={playQueue} 
              keyExtractor={(item, index) => 'queue-h-' + index} 
              onScroll={(e) => { scrollYRef.current = e.nativeEvent.contentOffset.y; }}
              scrollEventThrottle={16}
              renderItem={({item}) => (
                <View style={styles.songRowQueue}>
                    <Image source={item.localImageUri ? {uri: item.localImageUri} : DEFAULT_ICON} style={styles.smallArtQueue} />
                    <View style={{flex:1}}><Text style={{color: '#fff', fontWeight: 'bold'}} numberOfLines={1}>{item.title}</Text><Text style={{color: '#aaa'}} numberOfLines={1}>{item.artist}</Text></View>
                </View>
            )} />
          </Animated.View>
          <Animated.View style={[StyleSheet.absoluteFill, { padding: 20, opacity: subViewOpacity, transform: [{ translateX: subViewTranslateX }] }]} pointerEvents={showLyrics ? 'auto' : 'none'}>
            {currentSong?.lyric?.trim() ? (
                <ScrollView 
                  style={styles.lyricsScrollView} 
                  contentContainerStyle={{ paddingBottom: 30 }}
                  onScroll={(e) => { scrollYRef.current = e.nativeEvent.contentOffset.y; }}
                  scrollEventThrottle={16}
                >
                    <Text style={styles.lyricsText}>{currentSong?.lyric}</Text>
                </ScrollView>
            ) : (
                <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
                    <Text style={[styles.lyricsText, { opacity: 0.5, textAlign: 'center' }]}>歌詞が登録されていません</Text>
                </View>
            )}
          </Animated.View>
        </View>
      </View>
    );
  } else {
    const artSizeBig = width * 0.8;
    const artSizeSmall = 60;
    const artSizeAnim = transitionAnim.interpolate({ inputRange: [0, 1], outputRange:[artSizeBig, artSizeSmall] });
    const artRadiusAnim = transitionAnim.interpolate({ inputRange: [0, 1], outputRange: [20, 8] });

    contentLayout = (
      <View style={{ flex: 1 }}>
        {/* ★ 修正2: pointerEvents="none" を完全に削除し、バブリングを中継させます */}
        <View 
          style={[styles.fullHeaderContainer, { justifyContent: (showQueue || showLyrics) ? 'flex-start' : 'center' }]} 
        >
          <Animated.Image 
            source={currentSong?.localImageUri ? {uri: currentSong.localImageUri} : DEFAULT_ICON} 
            style={[styles.fullArtBase, { 
              width: artSizeAnim, 
              height: artSizeAnim, 
              borderRadius: artRadiusAnim, 
            }]} 
          />
          {(showQueue || showLyrics) && (
            <Animated.View style={[styles.sideTitleArea, { opacity: transitionAnim }]}>
                <Text style={styles.queueTitle} numberOfLines={1}>{currentSong?.title}</Text>
                <Text style={[styles.queueArtist, {color: '#aaa', fontSize: 14, marginTop: 2}]} numberOfLines={1}>{currentSong?.artist}</Text>
            </Animated.View>
          )}
        </View>

        <View style={{ flex: 1 }}>
            <Animated.View style={[StyleSheet.absoluteFill, { opacity: mainOpacity, transform: [{ translateX: mainTranslateX }] }]} pointerEvents={(showLyrics || showQueue) ? 'none' : 'auto'}>
                <View style={styles.mainPlaybackLayout}>
                    <View style={styles.mainTitlesCenter}>
                        <Text style={styles.fullTitle} numberOfLines={1}>{currentSong?.title}</Text>
                        <Text style={styles.fullArtist} numberOfLines={1}>{currentSong?.artist}</Text>
                    </View>
                    <View style={styles.sliderWithTime}>
                        <Slider style={{width: '100%', height: 40}} minimumValue={0} maximumValue={playbackStatus?.durationMillis || 100} value={playbackStatus?.positionMillis || 0} minimumTrackTintColor={themeColor} maximumTrackTintColor="rgba(255,255,255,0.3)" thumbTintColor="#fff" onSlidingComplete={v => sound?.setPositionAsync(v)} />
                        <View style={styles.timeRow}><Text style={styles.timeLabel}>{formatMillis(playbackStatus?.positionMillis)}</Text><Text style={styles.timeLabel}>{formatMillis(playbackStatus?.durationMillis)}</Text></View>
                    </View>
                    {renderControls(80, { width: '100%', justifyContent: 'space-around' })}
                </View>
            </Animated.View>

            <Animated.View style={[StyleSheet.absoluteFill, { opacity: subViewOpacity, transform:[{ translateX: subViewTranslateX }] }]} pointerEvents={(showLyrics || showQueue) ? 'auto' : 'none'}>
                <View style={[styles.queueViewArea, { paddingHorizontal: 20 }]}>
                    { showLyrics ? (
                        currentSong?.lyric?.trim() ? (
                            <ScrollView 
                              style={styles.lyricsScrollView} 
                              contentContainerStyle={{ paddingBottom: 30 }}
                              onScroll={(e) => { scrollYRef.current = e.nativeEvent.contentOffset.y; }}
                              scrollEventThrottle={16}
                            >
                                <Text style={styles.lyricsText}>{currentSong?.lyric}</Text>
                            </ScrollView>
                        ) : (
                            <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
                                <Text style={[styles.lyricsText, { opacity: 0.5, textAlign: 'center' }]}>歌詞が登録されていません</Text>
                            </View>
                        )
                    ) : (
                        <>
                            {renderQueueToggles()}
                            <FlatList 
                              data={playQueue} 
                              keyExtractor={(item, index) => 'queue-v-' + index} 
                              onScroll={(e) => { scrollYRef.current = e.nativeEvent.contentOffset.y; }}
                              scrollEventThrottle={16}
                              renderItem={({item}) => (
                                <View style={styles.songRowQueue}>
                                    <Image source={item.localImageUri ? {uri: item.localImageUri} : DEFAULT_ICON} style={styles.smallArtQueue} />
                                    <View style={{flex:1}}><Text style={{color: '#fff', fontWeight: 'bold'}} numberOfLines={1}>{item.title}</Text><Text style={{color: '#aaa'}} numberOfLines={1}>{item.artist}</Text></View>
                                </View>
                            )} />
                        </>
                    )}
                </View>
            </Animated.View>
        </View>

        <View style={styles.bottomButtonsRow}>
          <View style={styles.bottomButtonContainer}><TouchableOpacity onPress={toggleLyrics}><Ionicons name="musical-notes-outline" size={26} color={showLyrics ? themeColor : "rgba(255,255,255,0.6)"} /></TouchableOpacity></View>
          <View style={styles.bottomButtonContainer}><TouchableOpacity onPress={toggleQueue}><Ionicons name="list" size={26} color={showQueue ? themeColor : "rgba(255,255,255,0.6)"} /></TouchableOpacity></View>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.fullPlayerOverlay}>
      <Animated.View 
        style={[styles.fullPlayerContainer, { transform: [{ translateY: slideAnim }] }]}
        {...panResponder.panHandlers} 
      >
        {/* 背景Imageも透過させ、大元のPanResponderにタッチ判定を通します */}
        <Image 
          source={currentSong?.localImageUri ? {uri: currentSong.localImageUri} : null} 
          style={StyleSheet.absoluteFill} 
          blurRadius={60} 
          pointerEvents="none"
        />
        
        <BlurView intensity={80} tint="dark" style={styles.fullPlayerContent}>
          {/* ★ 修正3: swipeArea は普通の View に戻し、タップ判定は大元の PanResponder（StartY0 < 80）が引き受けます */}
          <View style={styles.swipeArea}>
            <View style={styles.fullPlayerHandle} />
          </View>
          {contentLayout}
          {toastVisible && (
              <Animated.View style={[styles.toastContainer, { opacity: toastAnim, transform: [{ translateY: toastAnim.interpolate({ inputRange:[0, 1], outputRange: [20, 0] }) }] }]}>
                  <BlurView intensity={50} tint="dark" style={styles.toastBlur}><Text style={styles.toastText}>{toastMessage}</Text></BlurView>
              </Animated.View>
          )}
        </BlurView>
      </Animated.View>
    </View>
  );
};
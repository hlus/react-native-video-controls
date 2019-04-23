import React, { Component } from "react";
import Video from "react-native-video";
import {
  TouchableWithoutFeedback,
  TouchableHighlight,
  ImageBackground,
  PanResponder,
  Animated,
  Easing,
  Image,
  View,
  Text
} from "react-native";
import _ from "lodash";

import styles from "./styles";

export default class VideoPlayer extends Component {
  static defaultProps = {
    quizPoints: [],
    toggleResizeModeOnFullscreen: true,
    playInBackground: false,
    playWhenInactive: false,
    showOnStart: true,
    resizeMode: "contain",
    paused: false,
    repeat: false,
    volume: 1,
    muted: false,
    title: "",
    rate: 1
  };

  constructor(props) {
    super(props);

    const { resizeMode, paused, muted, volume, rate, showOnStart } = props;
    this.state = {
      // Video
      resizeMode,
      paused,
      muted,
      volume,
      rate,

      // Controls
      isFullscreen: resizeMode === "cover" || false,
      showTimeRemaining: true,
      volumeTrackWidth: 0,
      lastScreenPress: 0,
      volumeFillWidth: 0,
      seekerFillWidth: 0,
      showControls: showOnStart,
      volumePosition: 0,
      seekerPosition: 0,
      volumeOffset: 0,
      seekerOffset: 0,
      seeking: false,
      loading: false,
      currentTime: 0,
      error: false,
      duration: 0
    };

    /**
     * Player information
     */
    this.player = {
      controlTimeoutDelay: this.props.controlTimeout || 15000,
      volumePanResponder: PanResponder,
      seekPanResponder: PanResponder,
      controlTimeout: null,
      volumeWidth: 150,
      iconOffset: 0,
      seekWidth: 0,
      ref: Video
    };

    /**
     * Various animations
     */
    const initialValue = this.props.showOnStart ? 1 : 0;

    this.animations = {
      bottomControl: {
        marginBottom: new Animated.Value(0),
        opacity: new Animated.Value(initialValue)
      },
      topControl: {
        marginTop: new Animated.Value(0),
        opacity: new Animated.Value(initialValue)
      },
      video: {
        opacity: new Animated.Value(1)
      },
      loader: {
        rotate: new Animated.Value(0),
        MAX_VALUE: 360
      }
    };

    /**
     * Various styles that be added...
     */
    this.styles = {
      videoStyle: this.props.videoStyle || {},
      containerStyle: this.props.style || {}
    };
  }

  /**
    | -------------------------------------------------------
    | Events
    | -------------------------------------------------------
    |
    | These are the events that the <Video> component uses
    | and can be overridden by assigning it as a prop.
    |
    */

  /**
   * When load starts we display a loading icon
   * and show the controls.
   */
  onLoadStart = args => {
    let state = this.state;
    state.loading = true;
    this.loadAnimation();
    this.setState(state);

    if (this.props.onLoadStart) {
      this.props.onLoadStart(args);
    }
  };

  /**
   * When load is finished we hide the load icon
   * and hide the controls. We also set the
   * video duration.
   *
   * @param {object} data The video meta data
   */
  onLoad = (data = {}) => {
    let state = this.state;

    state.duration = data.duration;
    state.loading = false;
    this.setState(state);

    if (state.showControls) {
      this.setControlTimeout();
    }

    if (this.props.onLoad) {
      this.props.onLoad(data);
    }
  };

  /**
   * For onprogress we fire listeners that
   * update our seekbar and timer.
   *
   * @param {object} data The video meta data
   */
  onProgress = (data = {}) => {
    let state = this.state;
    state.currentTime = data.currentTime;

    if (!state.seeking) {
      const position = this.calculateSeekerPosition();
      this.setSeekerPosition(position);
    }

    if (this.props.onProgress) {
      this.props.onProgress(data);
    }

    this.setState(state);
  };

  /**
   * Set the error state to true which then
   * changes our renderError function
   *
   * @param {object} err  Err obj returned from <Video> component
   */
  onError = err => {
    if (this.props.onError) {
      this.props.onError(err);
    } else {
      this.setState({
        error: true,
        loading: false
      });
    }
  };

  /**
   * This is a single and double tap listener
   * when the user taps the screen anywhere.
   * One tap toggles controls, two toggles
   * fullscreen mode.
   */
  onScreenTouch = () => {
    let { lastScreenPress } = this.state;
    const time = new Date().getTime();

    if (time - lastScreenPress < 300) {
      this.toggleFullscreen();
    }

    this.toggleControls();

    this.setState({
      lastScreenPress: time
    });
  };

  /**
    | -------------------------------------------------------
    | Methods
    | -------------------------------------------------------
    |
    | These are all of our functions that interact with
    | various parts of the class. Anything from
    | calculating time remaining in a video
    | to handling control operations.
    |
    */

  /**
   * Set a timeout when the controls are shown
   * that hides them after a length of time.
   * Default is 15s
   */
  setControlTimeout = () => {
    this.player.controlTimeout = setTimeout(() => {
      this.hideControls();
    }, this.player.controlTimeoutDelay);
  };

  /**
   * Clear the hide controls timeout.
   */
  clearControlTimeout = () => clearTimeout(this.player.controlTimeout);

  /**
   * Reset the timer completely
   */
  resetControlTimeout = () => {
    this.clearControlTimeout();
    this.setControlTimeout();
  };

  /**
   * Animation to hide controls. We fade the
   * display to 0 then move them off the
   * screen so they're not interactable
   */
  hideControlAnimation = () => {
    Animated.parallel([
      Animated.timing(this.animations.topControl.opacity, { toValue: 0 }),
      Animated.timing(this.animations.topControl.marginTop, { toValue: -100 }),
      Animated.timing(this.animations.bottomControl.opacity, { toValue: 0 }),
      Animated.timing(this.animations.bottomControl.marginBottom, {
        toValue: -100
      })
    ]).start();
  };

  /**
   * Animation to show controls...opposite of
   * above...move onto the screen and then
   * fade in.
   */
  showControlAnimation = () => {
    Animated.parallel([
      Animated.timing(this.animations.topControl.opacity, { toValue: 1 }),
      Animated.timing(this.animations.topControl.marginTop, { toValue: 0 }),
      Animated.timing(this.animations.bottomControl.opacity, { toValue: 1 }),
      Animated.timing(this.animations.bottomControl.marginBottom, {
        toValue: 0
      })
    ]).start();
  };

  /**
   * Loop animation to spin loader icon. If not loading then stop loop.
   */
  loadAnimation = () => {
    if (this.state.loading) {
      Animated.sequence([
        Animated.timing(this.animations.loader.rotate, {
          toValue: this.animations.loader.MAX_VALUE,
          duration: 1500,
          easing: Easing.linear
        }),
        Animated.timing(this.animations.loader.rotate, {
          toValue: 0,
          duration: 0,
          easing: Easing.linear
        })
      ]).start(this.loadAnimation);
    }
  };

  /**
   * Function to hide the controls. Sets our
   * state then calls the animation.
   */
  hideControls = () => {
    if (this.mounted) {
      this.hideControlAnimation();
      this.setState({
        showControls: false
      });
    }
  };

  /**
   * Function to toggle controls based on
   * current state.
   */
  toggleControls = () => {
    let state = this.state;
    state.showControls = !state.showControls;

    if (state.showControls) {
      this.showControlAnimation();
      this.setControlTimeout();
    } else {
      this.hideControlAnimation();
      this.clearControlTimeout();
    }

    this.setState(state);
  };

  /**
   * Toggle fullscreen changes resizeMode on
   * the <Video> component then updates the
   * isFullscreen state.
   */
  toggleFullscreen = () => {
    let state = this.state;

    state.isFullscreen = !state.isFullscreen;

    if (this.props.toggleResizeModeOnFullscreen) {
      state.resizeMode = state.isFullscreen ? "cover" : "contain";
    }

    if (state.isFullscreen) {
      if (this.props.onEnterFullscreen) {
        this.props.onEnterFullscreen();
      }
    } else {
      if (this.props.onExitFullscreen) {
        this.props.onExitFullscreen();
      }
    }

    this.setState(state);
  };

  /**
   * Toggle playing state on <Video> component
   */
  togglePlayPause = () => {
    let state = this.state;
    state.paused = !state.paused;

    if (state.paused) {
      if (this.props.onPause) {
        this.props.onPause();
      }
    } else {
      if (this.props.onPlay) {
        this.props.onPlay();
      }
    }

    this.setState(state);
  };

  /**
   * Toggle between showing time remaining or
   * video duration in the timer control
   */
  toggleTimer = () => {
    let state = this.state;
    state.showTimeRemaining = !state.showTimeRemaining;
    this.setState(state);
  };

  /**
   * The default 'onBack' function pops the navigator
   * and as such the video player requires a
   * navigator prop by default.
   */
  onBack = () => {
    if (this.props.onBack) {
      this.props.onBack();
    }
  };

  /**
   * Calculate the time to show in the timer area
   * based on if they want to see time remaining
   * or duration. Formatted to look as 00:00.
   */
  calculateTime = () => {
    if (this.state.showTimeRemaining) {
      const time = this.state.duration - this.state.currentTime;
      return `-${this.formatTime(time)}`;
    }

    return this.formatTime(this.state.currentTime);
  };

  /**
   * Format a time string as mm:ss
   *
   * @param {int} time time in milliseconds
   * @return {string} formatted time string in mm:ss format
   */
  formatTime = (time = 0) => {
    const symbol = this.state.showRemainingTime ? "-" : "";
    time = Math.min(Math.max(time, 0), this.state.duration);

    const formattedMinutes = _.padStart(Math.floor(time / 60).toFixed(0), 2, 0);
    const formattedSeconds = _.padStart(Math.floor(time % 60).toFixed(0), 2, 0);

    return `${symbol}${formattedMinutes}:${formattedSeconds}`;
  };

  /**
   * Set the position of the seekbar's components
   * (both fill and handle) according to the
   * position supplied.
   *
   * @param {float} position position in px of seeker handle}
   */
  setSeekerPosition = (position = 0) => {
    let state = this.state;
    position = this.constrainToSeekerMinMax(position);

    state.seekerFillWidth = position;
    state.seekerPosition = position;

    if (!state.seeking) {
      state.seekerOffset = position;
    }

    this.setState(state);
  };

  /**
   * Contrain the location of the seeker to the
   * min/max value based on how big the
   * seeker is.
   *
   * @param {float} val position of seeker handle in px
   * @return {float} contrained position of seeker handle in px
   */
  constrainToSeekerMinMax = (val = 0) => {
    if (val <= 0) {
      return 0;
    }
    if (val >= this.player.seekerWidth) {
      return this.player.seekerWidth;
    }
    return val;
  };

  /**
   * Calculate the position that the seeker should be
   * at along its track.
   *
   * @return {float} position of seeker handle in px based on currentTime
   */
  calculateSeekerPosition = () =>
    this.player.seekerWidth * (this.state.currentTime / this.state.duration);

  /**
   * Return the time that the video should be at
   * based on where the seeker handle is.
   *
   * @return {float} time in ms based on seekerPosition.
   */
  calculateTimeFromSeekerPosition = () =>
    this.state.duration * (this.state.seekerPosition / this.player.seekerWidth);

  /**
   * Seek to a time in the video.
   *
   * @param {float} time time to seek to in ms
   */
  seekTo = (time = 0) => {
    let state = this.state;
    state.currentTime = time;
    this.player.ref.seek(time);
    this.setState(state);
  };

  /**
   * Set the position of the volume slider
   *
   * @param {float} position position of the volume handle in px
   */
  setVolumePosition = (position = 0) => {
    let state = this.state;
    position = this.constrainToVolumeMinMax(position);
    state.volumePosition = position + this.player.iconOffset;
    state.volumeFillWidth = position;

    state.volumeTrackWidth = this.player.volumeWidth - state.volumeFillWidth;

    if (state.volumeFillWidth < 0) {
      state.volumeFillWidth = 0;
    }

    if (state.volumeTrackWidth > 150) {
      state.volumeTrackWidth = 150;
    }

    this.setState(state);
  };

  /**
   * Constrain the volume bar to the min/max of
   * its track's width.
   *
   * @param {float} val position of the volume handle in px
   * @return {float} contrained position of the volume handle in px
   */
  constrainToVolumeMinMax = (val = 0) => {
    if (val <= 0) {
      return 0;
    } else if (val >= this.player.volumeWidth + 9) {
      return this.player.volumeWidth + 9;
    }
    return val;
  };

  /**
   * Get the volume based on the position of the
   * volume object.
   *
   * @return {float} volume level based on volume handle position
   */
  calculateVolumeFromVolumePosition = () =>
    this.state.volumePosition / this.player.volumeWidth;

  /**
   * Get the position of the volume handle based
   * on the volume
   *
   * @return {float} volume handle position in px based on volume
   */
  calculateVolumePositionFromVolume = () =>
    this.player.volumeWidth * this.state.volume;

  /**
    | -------------------------------------------------------
    | React Component functions
    | -------------------------------------------------------
    |
    | Here we're initializing our listeners and getting
    | the component ready using the built-in React
    | Component methods
    |
    */

  /**
   * Before mounting, init our seekbar and volume bar
   * pan responders.
   */
  componentWillMount() {
    this.initSeekPanResponder();
    this.initVolumePanResponder();
  }

  /**
   * Upon mounting, calculate the position of the volume
   * bar based on the volume property supplied to it.
   */
  componentDidMount() {
    const position = this.calculateVolumePositionFromVolume();
    this.setVolumePosition(position);
    this.mounted = true;

    this.setState({ volumeOffset: position });
  }

  /**
   * When the component is about to unmount kill the
   * timeout less it fire in the prev/next scene
   */
  componentWillUnmount() {
    this.mounted = false;
    this.clearControlTimeout();
  }

  /**
   * Get our seekbar responder going
   */
  initSeekPanResponder() {
    this.player.seekPanResponder = PanResponder.create({
      // Ask to be the responder.
      onStartShouldSetPanResponder: (evt, gestureState) => true,
      onMoveShouldSetPanResponder: (evt, gestureState) => true,

      /**
       * When we start the pan tell the machine that we're
       * seeking. This stops it from updating the seekbar
       * position in the onProgress listener.
       */
      onPanResponderGrant: (evt, gestureState) => {
        let state = this.state;
        this.clearControlTimeout();
        state.seeking = true;
        this.setState(state);
      },

      /**
       * When panning, update the seekbar position, duh.
       */
      onPanResponderMove: (evt, gestureState) => {
        const position = this.state.seekerOffset + gestureState.dx;
        this.setSeekerPosition(position);
      },

      /**
       * On release we update the time and seek to it in the video.
       * If you seek to the end of the video we fire the
       * onEnd callback
       */
      onPanResponderRelease: (evt, gestureState) => {
        const time = this.calculateTimeFromSeekerPosition();
        let state = this.state;
        if (time >= state.duration && !state.loading) {
          state.paused = true;
          if (this.props.onEnd) {
            this.props.onEnd();
          }
        } else {
          this.seekTo(time);
          this.setControlTimeout();
          state.seeking = false;
        }
        this.setState(state);
      }
    });
  }

  /**
   * Initialize the volume pan responder.
   */
  initVolumePanResponder = () => {
    this.player.volumePanResponder = PanResponder.create({
      onStartShouldSetPanResponder: (evt, gestureState) => true,
      onMoveShouldSetPanResponder: (evt, gestureState) => true,
      onPanResponderGrant: (evt, gestureState) => {
        this.clearControlTimeout();
      },

      /**
       * Update the volume as we change the position.
       * If we go to 0 then turn on the mute prop
       * to avoid that weird static-y sound.
       */
      onPanResponderMove: (evt, gestureState) => {
        let state = this.state;
        const position = this.state.volumeOffset + gestureState.dx;

        this.setVolumePosition(position);
        state.volume = this.calculateVolumeFromVolumePosition();

        if (state.volume <= 0) {
          state.muted = true;
        } else {
          state.muted = false;
        }

        this.setState(state);
      },

      /**
       * Update the offset...
       */
      onPanResponderRelease: (evt, gestureState) => {
        let state = this.state;
        state.volumeOffset = state.volumePosition;
        this.setControlTimeout();
        this.setState(state);
      }
    });
  };

  /**
    | -------------------------------------------------------
    | Rendering
    | -------------------------------------------------------
    |
    | This section contains all of our render methods.
    | In addition to the typical React render func
    | we also have all the render methods for
    | the controls.
    |
    */

  /**
   * Standard render control function that handles
   * everything except the sliders. Adds a
   * consistent <TouchableHighlight>
   * wrapper and styling.
   */
  renderControl = (children, callback, style = {}) => (
    <TouchableHighlight
      underlayColor="transparent"
      activeOpacity={0.3}
      onPress={() => {
        this.resetControlTimeout();
        callback();
      }}
      style={[styles.controls.control, style]}
    >
      {children}
    </TouchableHighlight>
  );

  /**
   * Renders an empty control, used to disable a control without breaking the view layout.
   */
  renderNullControl = () => <View style={[styles.controls.control]} />;

  /**
   * Groups the top bar controls together in an animated
   * view and spaces them out.
   */
  renderTopControls = () => {
    const backControl = this.props.disableBack
      ? this.renderNullControl()
      : this.renderBack();
    const volumeControl = this.props.disableVolume
      ? this.renderNullControl()
      : this.renderVolume();
    const fullscreenControl = this.props.disableFullscreen
      ? this.renderNullControl()
      : this.renderFullscreen();

    return (
      <Animated.View
        style={[
          styles.controls.top,
          {
            opacity: this.animations.topControl.opacity,
            marginTop: this.animations.topControl.marginTop
          }
        ]}
      >
        <ImageBackground
          source={require("./assets/img/top-vignette.png")}
          style={[styles.controls.column]}
          imageStyle={[styles.controls.vignette]}
        >
          <View style={styles.controls.topControlGroup}>
            {backControl}
            <View style={styles.controls.pullRight}>
              {volumeControl}
              {fullscreenControl}
            </View>
          </View>
        </ImageBackground>
      </Animated.View>
    );
  };

  /**
   * Back button control
   */
  renderBack = () => {
    return this.renderControl(
      <Image
        source={require("./assets/img/back.png")}
        style={styles.controls.back}
      />,
      this.onBack,
      styles.controls.back
    );
  };

  /**
   * Render the volume slider and attach the pan handlers
   */
  renderVolume = () => (
    <View style={styles.volume.container}>
      <View
        style={[styles.volume.fill, { width: this.state.volumeFillWidth }]}
      />
      <View
        style={[styles.volume.track, { width: this.state.volumeTrackWidth }]}
      />
      <View
        style={[styles.volume.handle, { left: this.state.volumePosition }]}
        {...this.player.volumePanResponder.panHandlers}
      >
        <Image
          style={styles.volume.icon}
          source={require("./assets/img/volume.png")}
        />
      </View>
    </View>
  );

  /**
   * Render fullscreen toggle and set icon based on the fullscreen state.
   */
  renderFullscreen = () => {
    let source =
      this.state.isFullscreen === true
        ? require("./assets/img/shrink.png")
        : require("./assets/img/expand.png");
    return this.renderControl(
      <Image source={source} />,
      this.toggleFullscreen,
      styles.controls.fullscreen
    );
  }

  /**
   * Render bottom control group and wrap it in a holder
   */
  renderBottomControls = () => {
    const timerControl = this.props.disableTimer
      ? this.renderNullControl()
      : this.renderTimer();
    const seekbarControl = this.props.disableSeekbar
      ? this.renderNullControl()
      : this.renderSeekbar();
    const playPauseControl = this.props.disablePlayPause
      ? this.renderNullControl()
      : this.renderPlayPause();

    return (
      <Animated.View
        style={[
          styles.controls.bottom,
          {
            opacity: this.animations.bottomControl.opacity,
            marginBottom: this.animations.bottomControl.marginBottom
          }
        ]}
      >
        <ImageBackground
          source={require("./assets/img/bottom-vignette.png")}
          style={[styles.controls.column]}
          imageStyle={[styles.controls.vignette]}
        >
          {seekbarControl}
          <View
            style={[styles.controls.row, styles.controls.bottomControlGroup]}
          >
            {playPauseControl}
            {this.renderTitle()}
            {timerControl}
          </View>
        </ImageBackground>
      </Animated.View>
    );
  }

  renderQuizPoint = quizPoint => {
    const leftCal =
      (this.player.seekerWidth * quizPoint.time) / this.state.duration;
    return (
      <View
        key={`quiz-${quizPoint.id}`}
        style={[styles.quizPoints.point, { left: leftCal }]}
      />
    );
  };

  renderQuizPoints = () => {
    const { quizPoints } = this.props;
    if (!quizPoints || !this.player.seekerWidth || !this.state.duration) {
      return null;
    }

    return (
      <View style={styles.quizPoints.wrapper}>
        {quizPoints.map(this.renderQuizPoint)}
      </View>
    );
  }

  /**
   * Render the seekbar and attach its handlers
   */
  renderSeekbar = () => (
    <View style={styles.seekbar.container}>
      <View
        style={styles.seekbar.track}
        onLayout={event =>
          (this.player.seekerWidth = event.nativeEvent.layout.width)
        }
      >
        <View
          style={[
            styles.seekbar.fill,
            {
              width: this.state.seekerFillWidth,
              backgroundColor: this.props.seekColor || "#FFF"
            }
          ]}
        />
      </View>
      {this.renderQuizPoints()}
      <View
        style={[styles.seekbar.handle, { left: this.state.seekerPosition }]}
        {...this.player.seekPanResponder.panHandlers}
      >
        <View
          style={[
            styles.seekbar.circle,
            { backgroundColor: this.props.seekColor || "#FFF" }
          ]}
        />
      </View>
    </View>
  );

  /**
   * Render the play/pause button and show the respective icon
   */
  renderPlayPause = () => {
    let source =
      this.state.paused === true
        ? require("./assets/img/play.png")
        : require("./assets/img/pause.png");
    return this.renderControl(
      <Image source={source} />,
      this.togglePlayPause,
      styles.controls.playPause
    );
  }

  /**
   * Render our title...if supplied.
   */
  renderTitle = () => {
    const { title } = this.props;
    if (title) {
      return (
        <View style={[styles.controls.control, styles.controls.title]}>
          <Text
            style={[styles.controls.text, styles.controls.titleText]}
            numberOfLines={1}
          >
            {title}
          </Text>
        </View>
      );
    }

    return null;
  };

  /**
   * Show our timer.
   */
  renderTimer = () => {
    return this.renderControl(
      <Text style={styles.controls.timerText}>{this.calculateTime()}</Text>,
      this.toggleTimer,
      styles.controls.timer
    );
  }

  /**
   * Show loading icon
   */
  renderLoader = () => {
    if (this.state.loading) {
      return (
        <View style={styles.loader.container}>
          <Animated.Image
            source={require("./assets/img/loader-icon.png")}
            style={[
              styles.loader.icon,
              {
                transform: [
                  {
                    rotate: this.animations.loader.rotate.interpolate({
                      inputRange: [0, 360],
                      outputRange: ["0deg", "360deg"]
                    })
                  }
                ]
              }
            ]}
          />
        </View>
      );
    }
    return null;
  }

  renderError = () => {
    if (this.state.error) {
      return (
        <View style={styles.error.container}>
          <Image
            source={require("./assets/img/error-icon.png")}
            style={styles.error.icon}
          />
          <Text style={styles.error.text}>Video unavailable</Text>
        </View>
      );
    }
    return null;
  }

  /**
   * Provide all of our options and render the whole component.
   */
  render() {
    return (
      <TouchableWithoutFeedback
        onPress={this.onScreenTouch}
        style={[styles.player.container, this.styles.containerStyle]}
      >
        <View style={[styles.player.container, this.styles.containerStyle]}>
          <Video
            {...this.props}
            ref={videoPlayer => (this.player.ref = videoPlayer)}
            resizeMode={this.state.resizeMode}
            volume={this.state.volume}
            paused={this.state.paused}
            muted={this.state.muted}
            rate={this.state.rate}
            onLoadStart={this.onLoadStart}
            onProgress={this.onProgress}
            onError={this.onError}
            onLoad={this.onLoad}
            style={[styles.player.video, this.styles.videoStyle]}
          />
          {this.renderError()}
          {this.renderTopControls()}
          {this.renderLoader()}
          {this.renderBottomControls()}
        </View>
      </TouchableWithoutFeedback>
    );
  }
}

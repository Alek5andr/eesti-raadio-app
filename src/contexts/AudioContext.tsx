import React, { createContext, useContext, useReducer, useEffect, useRef } from 'react';
import { Audio, AVPlaybackStatus } from 'expo-av';
import { AppState, AppStateStatus } from 'react-native';
import { AudioState, Episode } from '../types';
import { StorageService } from '../services/StorageService';
import { NotificationService } from '../services/NotificationService';

interface AudioContextType {
    state: AudioState;
    playEpisode: (episode: Episode, showDetails?: any) => Promise<void>;
    pausePlayback: () => Promise<void>;
    resumePlayback: () => Promise<void>;
    seekTo: (position: number) => Promise<void>;
    togglePlayPause: () => Promise<void>;
    setShowDetails: (showDetails: any) => void;
}

const AudioContext = createContext<AudioContextType | undefined>(undefined);

type AudioAction =
    | { type: 'SET_EPISODE'; payload: Episode }
    | { type: 'SET_PLAYING'; payload: boolean }
    | { type: 'SET_TIME'; payload: number }
    | { type: 'SET_DURATION'; payload: number }
    | { type: 'SET_LOADING'; payload: boolean }
    | { type: 'SET_SHOW_DETAILS'; payload: any }
    | { type: 'SET_ERROR'; payload: string | null };

const audioReducer = (state: AudioState, action: AudioAction): AudioState => {
    switch (action.type) {
        case 'SET_EPISODE':
            return { ...state, currentEpisode: action.payload };
        case 'SET_PLAYING':
            return { ...state, isPlaying: action.payload };
        case 'SET_TIME':
            return { ...state, currentTime: action.payload };
        case 'SET_DURATION':
            return { ...state, duration: action.payload };
        case 'SET_LOADING':
            return { ...state, isLoading: action.payload };
        case 'SET_SHOW_DETAILS':
            return { ...state, showDetails: action.payload };
        case 'SET_ERROR':
            return { ...state, error: action.payload };
        default:
            return state;
    }
};

const initialState: AudioState = {
    isPlaying: false,
    currentTime: 0,
    duration: 0,
    currentEpisode: null,
    isLoading: false,
    showDetails: null,
    error: null,
};

export const AudioProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [state, dispatch] = useReducer(audioReducer, initialState);
    const soundRef = useRef<Audio.Sound | null>(null);
    const notificationService = useRef<NotificationService>(NotificationService.getInstance());
    const updateIntervalRef = useRef<NodeJS.Timeout | null>(null);
    const isInitialized = useRef<boolean>(false);
    useEffect(() => {
        const initAudio = async () => {
            try {
                if (isInitialized.current) return;

                console.log('Audio initialization...');

                await Audio.setAudioModeAsync({
                    allowsRecordingIOS: false,
                    staysActiveInBackground: true,
                    playsInSilentModeIOS: true,
                    shouldDuckAndroid: true,
                    playThroughEarpieceAndroid: false,
                });
                const notificationSetupSuccess = await notificationService.current.setupNotifications();
                if (!notificationSetupSuccess) {
                    console.warn('Не удалось настроить уведомления');
                }
                const removeListeners = notificationService.current.setupNotificationListeners(
                    (data) => {
                        console.log('Tapping on the notification:', data);
                    },
                    async () => {
                        try {
                            await togglePlayPause();
                        } catch (error) {
                            console.error('Error switching playback from the notification:', error);
                        }
                    }
                );
                await restorePlaybackState();

                isInitialized.current = true;
                console.log('Audio is initialized successfully');

                return removeListeners;
            } catch (error) {
                console.error('Error initializing audio:', error);
                dispatch({ type: 'SET_ERROR', payload: 'Audio initialization error' });
                return undefined;
            }
        };

        let removeListeners: (() => void) | undefined;

        initAudio()
            .then((cleanup) => {
                removeListeners = cleanup;
            })
            .catch((error) => {
                console.error('Critical initialization error:', error);
            });
        const handleAppStateChange = async (nextAppState: AppStateStatus) => {
            try {
                if (nextAppState === 'background' || nextAppState === 'inactive') {
                    if (state.currentEpisode && soundRef.current) {
                        await StorageService.savePlaybackState(state.currentEpisode, state.currentTime);
                    }
                }
            } catch (error) {
                console.error('Error in app\'s state change:', error);
            }
        };

        const appStateSubscription = AppState.addEventListener('change', handleAppStateChange);

        return () => {
            console.log('Clearing audio context...');
            if (soundRef.current) {
                soundRef.current.unloadAsync().catch((error) => {
                    console.error('Error uploading audio:', error);
                });
            }
            if (updateIntervalRef.current) {
                clearInterval(updateIntervalRef.current);
            }
            notificationService.current.hidePlayerNotification().catch((error) => {
                console.error('Error hiding notification:', error);
            });
            if (removeListeners) {
                try {
                    removeListeners();
                } catch (error) {
                    console.error('Error clearing listeners:', error);
                }
            }

            appStateSubscription?.remove();
            isInitialized.current = false;
        };
    }, []);    const getImageUrl = (episode: Episode, showDetails: any): string | undefined => {
        try {
            if (showDetails?.mainContent?.rootContent?.squarePhotos?.length > 0) {
                return showDetails.mainContent.rootContent.squarePhotos[0].photoTypes[4].url;
            } else if (episode.photos && episode.photos.length > 0) {
                return episode.photos[0].photoTypes[4].url;
            }
            return undefined;
        } catch (error) {
            console.error('Error getting image URL:', error);
            return undefined;
        }
    };
    useEffect(() => {
        if (state.currentEpisode && (state.duration > 0 || state.isPlaying)) {
            try {
                const imageUrl = getImageUrl(state.currentEpisode, state.showDetails);
                notificationService.current.showPlayerNotification(
                    state.currentEpisode,
                    state.isPlaying,
                    state.currentTime,
                    state.duration,
                    imageUrl
                ).catch((error) => {
                    console.error('Error displaying notification:', error);
                });
            } catch (error) {
                console.error('Error updating notification:', error);
            }
        }
    }, [state.isPlaying, state.currentEpisode, state.showDetails]);

    useEffect(() => {
        if (state.currentEpisode && state.isPlaying && state.duration > 0) {
            const seconds = Math.floor(state.currentTime / 1000);
            if (seconds % 1 === 0) {
                try {
                    const imageUrl = getImageUrl(state.currentEpisode, state.showDetails);
                    notificationService.current.showPlayerNotification(
                        state.currentEpisode,
                        state.isPlaying,
                        state.currentTime,
                        state.duration,
                        imageUrl
                    ).catch((error) => {
                        console.error('Error updating time in notification:', error);
                    });
                } catch (error) {
                    console.error('Error while updating notification periodically:', error);
                }
            }
        }
    }, [state.currentTime]);
    const savePlaybackState = async (episode: Episode, position: number) => {
        try {
            await StorageService.savePlaybackState(episode, position);
        } catch (error) {
            console.error('Error saving playback state:', error);
        }
    };
    const restorePlaybackState = async () => {
        try {
            const playbackState = await StorageService.getPlaybackState();

            if (playbackState) {
                const { episode, position } = playbackState;
                dispatch({ type: 'SET_EPISODE', payload: episode });
                dispatch({ type: 'SET_TIME', payload: position });
                console.log('Playing state is recovered');
            }
        } catch (error) {
            console.error('Error recovering the state:', error);
        }
    };
    const onPlaybackStatusUpdate = (status: AVPlaybackStatus) => {
        try {
            if (status.isLoaded) {
                dispatch({ type: 'SET_TIME', payload: status.positionMillis || 0 });
                dispatch({ type: 'SET_DURATION', payload: status.durationMillis || 0 });
                dispatch({ type: 'SET_PLAYING', payload: status.isPlaying });
                dispatch({ type: 'SET_LOADING', payload: status.isBuffering });
                dispatch({ type: 'SET_ERROR', payload: null });                if (state.currentEpisode && status.positionMillis && status.isPlaying) {
                    savePlaybackState(state.currentEpisode, status.positionMillis);
                }
            } else if (!status.isLoaded && status.error) {
                console.error('Playback error:', status.error);
                dispatch({ type: 'SET_ERROR', payload: 'Audio playback error' });
                dispatch({ type: 'SET_PLAYING', payload: false });
                dispatch({ type: 'SET_LOADING', payload: false });
            }
        } catch (error) {
            console.error('Error in playback status handler:', error);
        }
    };

    const getStreamUrl = (episode: Episode): string | null => {
        try {
            const extractUrl = (srcObj: any): string | null => {
                if (!srcObj) return null;

                if (srcObj.file) {
                    return `https:${srcObj.file}`;
                } else if (srcObj.hls) {
                    return `https:${srcObj.hls}`;
                } else if (srcObj.hls2) {
                    return `https:${srcObj.hls2}`;
                } else if (srcObj.hlsNew) {
                    return `https:${srcObj.hlsNew}`;
                }
                return null;
            };
            if (episode.medias && episode.medias.length > 0) {
                const media = episode.medias[0];
                if (media && media.src) {
                    const url = extractUrl(media.src);
                    if (url) return url;
                }
            }
            if (episode.clips && episode.clips.length > 0) {
                const clip = episode.clips[0];
                if (clip && clip.medias && clip.medias.length > 0) {
                    const clipMedia = clip.medias[0];
                    if (clipMedia && clipMedia.src) {
                        const url = extractUrl(clipMedia.src);
                        if (url) return url;
                    }
                }
            }

            return null;
        } catch (error) {
            console.error('Error fetching stream URL:', error);
            return null;
        }
    };

    const playEpisode = async (episode: Episode, showDetails?: any) => {
        try {
            console.log('Starting to play an episode:', episode.heading);
            dispatch({ type: 'SET_LOADING', payload: true });
            dispatch({ type: 'SET_ERROR', payload: null });
            if (!state.currentEpisode || state.currentEpisode.id !== episode.id) {
                try {
                    await notificationService.current.clearBeforeNewEpisode();
                } catch (error) {
                    console.error('Error cleaning notifications:', error);
                }
            }
            if (showDetails) {
                dispatch({ type: 'SET_SHOW_DETAILS', payload: showDetails });
            }
            const streamUrl = getStreamUrl(episode);
            if (!streamUrl) {
                throw new Error('Stream is not found of not available');
            }

            console.log('Stream\'s URL:', streamUrl);
            if (soundRef.current && (!state.currentEpisode || state.currentEpisode.id !== episode.id)) {
                try {
                    await soundRef.current.unloadAsync();
                    soundRef.current = null;
                } catch (error) {
                    console.error('Error loading out previous sound:', error);
                }
            }
            if (!state.currentEpisode || state.currentEpisode.id !== episode.id) {
                try {
                    const { sound } = await Audio.Sound.createAsync(
                        { uri: streamUrl },
                        {
                            shouldPlay: true,
                            progressUpdateIntervalMillis: 1000,                            positionMillis: 0
                        },
                        onPlaybackStatusUpdate
                    );

                    soundRef.current = sound;
                    dispatch({ type: 'SET_EPISODE', payload: episode });
                    const playbackState = await StorageService.getPlaybackState();
                    if (playbackState && playbackState.episode.id === episode.id && playbackState.position > 0) {
                        try {
                            await sound.setPositionAsync(playbackState.position);
                            console.log('Position is recovered:', playbackState.position);
                        } catch (error) {
                            console.error('Error recovering the position:', error);
                        }
                    }
                } catch (error) {
                    console.error('Error of sound initialization:', error);
                    throw new Error('Audio file could not be loaded');
                }
            } else {
                if (soundRef.current) {
                    try {
                        await soundRef.current.playAsync();
                    } catch (error) {
                        console.error('Error resuming playback:', error);
                        throw error;
                    }
                }
            }

            console.log('Episode is started successfully');
        } catch (error) {
            console.error('Playing error:', error);
            dispatch({ type: 'SET_ERROR', payload: 'Could not start the episode' });
            dispatch({ type: 'SET_PLAYING', payload: false });
        } finally {
            dispatch({ type: 'SET_LOADING', payload: false });
        }
    };

    const setShowDetails = (showDetails: any) => {
        dispatch({ type: 'SET_SHOW_DETAILS', payload: showDetails });
    };

    const pausePlayback = async () => {
        try {
            if (soundRef.current) {
                await soundRef.current.pauseAsync();
            }
        } catch (error) {
            console.error('Pausing error:', error);
            dispatch({ type: 'SET_ERROR', payload: 'Playback pausing error' });
        }
    };

    const resumePlayback = async () => {
        try {
            if (soundRef.current) {
                await soundRef.current.playAsync();
            }
        } catch (error) {
            console.error('Resuming error:', error);
            dispatch({ type: 'SET_ERROR', payload: 'Playback resuming error' });
        }
    };

    const seekTo = async (position: number) => {
        try {
            if (soundRef.current) {
                await soundRef.current.setPositionAsync(position);
            }
        } catch (error) {
            console.error('Rewind error:', error);
            dispatch({ type: 'SET_ERROR', payload: 'Rewind error' });
        }
    };

    const togglePlayPause = async () => {
        try {
            if (!soundRef.current) {
                console.warn('Звуковой объект не инициализирован');
                return;
            }
            const status = await soundRef.current.getStatusAsync();

            if (status.isLoaded && status.isPlaying) {
                console.log('Pausing from the notification');
                await pausePlayback();
            } else if (status.isLoaded && !status.isPlaying) {
                console.log('Resuming from the notification');
                await resumePlayback();
            } else {
                console.warn('Unpredictable audio state:', status);
            }
        } catch (error) {
            console.error('Error switching playback:', error);
            dispatch({ type: 'SET_ERROR', payload: 'Error switching playback' });
        }
    };

    const value: AudioContextType = {
        state,
        playEpisode,
        pausePlayback,
        resumePlayback,
        seekTo,
        togglePlayPause,
        setShowDetails,
    };

    return (
        <AudioContext.Provider value={value}>
            {children}
        </AudioContext.Provider>
    );
};

export const useAudio = () => {
    const context = useContext(AudioContext);
    if (!context) {
        throw new Error('useAudio must be used within AudioProvider');
    }
    return context;
};
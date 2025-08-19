import React, { createContext, useContext, useReducer, useEffect, useRef } from 'react';
import { Audio, AVPlaybackStatus } from 'expo-av';
import { AppState, AppStateStatus } from 'react-native';
import { AudioState, Episode } from '../types';
import { StorageService } from '../services/StorageService';
import { NotificationService } from '../services/NotificationService';

console.log('AudioContext загружается...');

interface AudioContextType {
    state: AudioState;
    playEpisode: (episode: Episode) => Promise<void>;
    pausePlayback: () => Promise<void>;
    resumePlayback: () => Promise<void>;
    seekTo: (position: number) => Promise<void>;
    togglePlayPause: () => Promise<void>;
    setShowDetails: (showDetails: any) => void
}

const AudioContext = createContext<AudioContextType | undefined>(undefined);

type AudioAction =
    | { type: 'SET_EPISODE'; payload: Episode }
    | { type: 'SET_PLAYING'; payload: boolean }
    | { type: 'SET_TIME'; payload: number }
    | { type: 'SET_DURATION'; payload: number }
    | { type: 'SET_LOADING'; payload: boolean }
    | { type: 'SET_SHOW_DETAILS'; payload: any };

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
};

// В AudioContext.tsx
console.log('AudioContext загружается...');

export const AudioProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [state, dispatch] = useReducer(audioReducer, initialState);
    const soundRef = useRef<Audio.Sound | null>(null);
    const notificationService = useRef<NotificationService>(NotificationService.getInstance());
    const updateIntervalRef = useRef<NodeJS.Timeout | null>(null);

    // Инициализация аудио
    useEffect(() => {
        const initAudio = async () => {
            await Audio.setAudioModeAsync({
                allowsRecordingIOS: false,
                staysActiveInBackground: true,
                playsInSilentModeIOS: true,
                shouldDuckAndroid: true,
                playThroughEarpieceAndroid: false,
            });

            // Настройка уведомлений
            await notificationService.current.setupNotifications();

            // Настройка обработчиков уведомлений
            const removeListeners = notificationService.current.setupNotificationListeners(
                (data) => {
                    // Обработка нажатия на уведомление - открыть приложение
                    console.log('Нажатие на уведомление:', data);
                },
                () => {
                    // Обработка нажатия на кнопку Play/Pause
                    togglePlayPause();
                }
            );

            // Восстановление состояния при запуске
            await restorePlaybackState();

            return removeListeners;
        };

        let removeListeners: (() => void) | undefined;

        initAudio().then((cleanup) => {
            removeListeners = cleanup;
        });

        // Обработка изменения состояния приложения
        const handleAppStateChange = (nextAppState: AppStateStatus) => {
            if (nextAppState === 'background' || nextAppState === 'inactive') {
                // Сохранение состояния при переходе в фон
                if (state.currentEpisode && soundRef.current) {
                    StorageService.savePlaybackState(state.currentEpisode, state.currentTime);
                }
            }
        };

        const appStateSubscription = AppState.addEventListener('change', handleAppStateChange);

        return () => {
            if (soundRef.current) {
                soundRef.current.unloadAsync();
            }
            if (updateIntervalRef.current) {
                clearInterval(updateIntervalRef.current);
            }
            if (removeListeners) {
                removeListeners();
            }
            appStateSubscription?.remove();
        };
    }, []);


    // Функция для получения URL изображения
    const getImageUrl = (episode: Episode, showDetails: any): string | undefined => {
        if (showDetails?.mainContent?.rootContent?.squarePhotos?.length > 0) {
            return showDetails.mainContent.rootContent.squarePhotos[0].photoTypes[4].url;
        } else if (episode.photos && episode.photos.length > 0) {
            return episode.photos[0].photoTypes[4].url;
        }
        return undefined;
    };

    // Обновление уведомлений при изменении состояния
    useEffect(() => {
        if (state.currentEpisode) {
            const imageUrl = getImageUrl(state.currentEpisode, state.showDetails);
            notificationService.current.showPlayerNotification(
                state.currentEpisode,
                state.isPlaying,
                state.currentTime,
                state.duration,
                imageUrl
            );
        }
    }, [state.isPlaying, state.currentTime, state.duration, state.currentEpisode, state.showDetails]);

    // Сохранение состояния
    const savePlaybackState = async (episode: Episode, position: number) => {
        await StorageService.savePlaybackState(episode, position);
    };

    // Восстановление состояния
    const restorePlaybackState = async () => {
        try {
            const playbackState = await StorageService.getPlaybackState();

            if (playbackState) {
                const { episode, position } = playbackState;
                dispatch({ type: 'SET_EPISODE', payload: episode });
                dispatch({ type: 'SET_TIME', payload: position });

                // Не начинаем воспроизведение автоматически при восстановлении
                // Пользователь должен сам нажать play
            }
        } catch (error) {
            console.error('Ошибка восстановления состояния:', error);
        }
    };

    // Обработчик статуса воспроизведения
    const onPlaybackStatusUpdate = (status: AVPlaybackStatus) => {
        if (status.isLoaded) {
            dispatch({ type: 'SET_TIME', payload: status.positionMillis || 0 });
            dispatch({ type: 'SET_DURATION', payload: status.durationMillis || 0 });
            dispatch({ type: 'SET_PLAYING', payload: status.isPlaying });
            dispatch({ type: 'SET_LOADING', payload: status.isBuffering });

            // Периодическое сохранение позиции
            if (state.currentEpisode && status.positionMillis && status.isPlaying) {
                savePlaybackState(state.currentEpisode, status.positionMillis);
            }
        }
    };

    // Добавьте эту функцию в AudioContext.tsx перед playEpisode
    const getStreamUrl = (episode: Episode): string | null => {
        // Функция для извлечения URL из объекта src
        const extractUrl = (srcObj: any): string | null => {
            if (!srcObj) return null;

            // Приоритет: file > hls > hls2 > hlsNew
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

        // Проверяем medias
        if (episode.medias && episode.medias.length > 0) {
            const media = episode.medias[0];
            if (media && media.src) {
                const url = extractUrl(media.src);
                if (url) return url;
            }
        }

        // Проверяем clips
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
    };

    const playEpisode = async (episode: Episode, showDetails?: any) => {
        try {
            dispatch({ type: 'SET_LOADING', payload: true });

            // Сохраняем данные о передаче если они переданы
            if (showDetails) {
                dispatch({ type: 'SET_SHOW_DETAILS', payload: showDetails });
            }

            // Получаем URL потока (используйте вашу функцию getStreamUrl)
            const streamUrl = getStreamUrl(episode);

            if (!streamUrl) {
                console.log('Структура episode:', JSON.stringify(episode, null, 2));
                throw new Error('Поток не найден. Проверьте структуру данных эпизода.');
            }

            console.log('Найден streamUrl:', streamUrl);

            // Выгрузка предыдущего звука
            if (soundRef.current) {
                await soundRef.current.unloadAsync();
            }

            // Создание нового звука
            const { sound } = await Audio.Sound.createAsync(
                { uri: streamUrl },
                { shouldPlay: true },
                onPlaybackStatusUpdate
            );

            soundRef.current = sound;
            dispatch({ type: 'SET_EPISODE', payload: episode });

            // Восстановление позиции если это тот же эпизод
            const playbackState = await StorageService.getPlaybackState();
            if (playbackState && playbackState.episode.id === episode.id) {
                await sound.setPositionAsync(playbackState.position);
            }

        } catch (error) {
            console.error('Ошибка воспроизведения:', error);
        } finally {
            dispatch({ type: 'SET_LOADING', payload: false });
        }
    };

    // Новый метод для установки данных о передаче
    const setShowDetails = (showDetails: any) => {
        dispatch({ type: 'SET_SHOW_DETAILS', payload: showDetails });
    };

    const pausePlayback = async () => {
        if (soundRef.current) {
            await soundRef.current.pauseAsync();
        }
    };

    const resumePlayback = async () => {
        if (soundRef.current) {
            await soundRef.current.playAsync();
        }
    };

    const seekTo = async (position: number) => {
        if (soundRef.current) {
            await soundRef.current.setPositionAsync(position);
        }
    };

    const togglePlayPause = async () => {
        if (state.isPlaying) {
            await pausePlayback();
        } else {
            await resumePlayback();
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
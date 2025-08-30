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

    // Инициализация аудио
    useEffect(() => {
        const initAudio = async () => {
            try {
                if (isInitialized.current) return;

                console.log('Инициализация аудио...');

                await Audio.setAudioModeAsync({
                    allowsRecordingIOS: false,
                    staysActiveInBackground: true,
                    playsInSilentModeIOS: true,
                    shouldDuckAndroid: true,
                    playThroughEarpieceAndroid: false,
                });

                // Настройка уведомлений
                const notificationSetupSuccess = await notificationService.current.setupNotifications();
                if (!notificationSetupSuccess) {
                    console.warn('Не удалось настроить уведомления');
                }

                // Настройка обработчиков уведомлений
                const removeListeners = notificationService.current.setupNotificationListeners(
                    (data) => {
                        console.log('Нажатие на уведомление:', data);
                    },
                    async () => {
                        try {
                            await togglePlayPause();
                        } catch (error) {
                            console.error('Ошибка при переключении воспроизведения из уведомления:', error);
                        }
                    }
                );

                // Восстановление состояния при запуске
                await restorePlaybackState();

                isInitialized.current = true;
                console.log('Аудио инициализировано успешно');

                return removeListeners;
            } catch (error) {
                console.error('Ошибка инициализации аудио:', error);
                dispatch({ type: 'SET_ERROR', payload: 'Ошибка инициализации аудио' });
                return undefined;
            }
        };

        let removeListeners: (() => void) | undefined;

        initAudio()
            .then((cleanup) => {
                removeListeners = cleanup;
            })
            .catch((error) => {
                console.error('Критическая ошибка инициализации:', error);
            });

        // Обработка изменения состояния приложения
        const handleAppStateChange = async (nextAppState: AppStateStatus) => {
            try {
                if (nextAppState === 'background' || nextAppState === 'inactive') {
                    // Сохранение состояния при переходе в фон
                    if (state.currentEpisode && soundRef.current) {
                        await StorageService.savePlaybackState(state.currentEpisode, state.currentTime);
                    }
                }
            } catch (error) {
                console.error('Ошибка при изменении состояния приложения:', error);
            }
        };

        const appStateSubscription = AppState.addEventListener('change', handleAppStateChange);

        return () => {
            console.log('Очистка аудио контекста...');

            // Очистка звука
            if (soundRef.current) {
                soundRef.current.unloadAsync().catch((error) => {
                    console.error('Ошибка выгрузки звука:', error);
                });
            }

            // Очистка интервала
            if (updateIntervalRef.current) {
                clearInterval(updateIntervalRef.current);
            }

            // Очистка уведомлений
            notificationService.current.hidePlayerNotification().catch((error) => {
                console.error('Ошибка скрытия уведомления:', error);
            });

            // Очистка слушателей
            if (removeListeners) {
                try {
                    removeListeners();
                } catch (error) {
                    console.error('Ошибка очистки слушателей:', error);
                }
            }

            appStateSubscription?.remove();
            isInitialized.current = false;
        };
    }, []); // Убираем зависимости чтобы избежать повторной инициализации

    // Функция для получения URL изображения
    const getImageUrl = (episode: Episode, showDetails: any): string | undefined => {
        try {
            if (showDetails?.mainContent?.rootContent?.squarePhotos?.length > 0) {
                return showDetails.mainContent.rootContent.squarePhotos[0].photoTypes[4].url;
            } else if (episode.photos && episode.photos.length > 0) {
                return episode.photos[0].photoTypes[4].url;
            }
            return undefined;
        } catch (error) {
            console.error('Ошибка получения URL изображения:', error);
            return undefined;
        }
    };

    // Обновление уведомлений при изменении состояния
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
                    console.error('Ошибка показа уведомления:', error);
                });
            } catch (error) {
                console.error('Ошибка при обновлении уведомления:', error);
            }
        }
    }, [state.isPlaying, state.currentEpisode, state.showDetails]);

    useEffect(() => {
        // Обновляем время в уведомлении каждую 1 секунду
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
                        console.error('Ошибка обновления времени в уведомлении:', error);
                    });
                } catch (error) {
                    console.error('Ошибка при периодическом обновлении уведомления:', error);
                }
            }
        }
    }, [state.currentTime]);

    // Сохранение состояния с обработкой ошибок
    const savePlaybackState = async (episode: Episode, position: number) => {
        try {
            await StorageService.savePlaybackState(episode, position);
        } catch (error) {
            console.error('Ошибка сохранения состояния воспроизведения:', error);
        }
    };

    // Восстановление состояния с обработкой ошибок
    const restorePlaybackState = async () => {
        try {
            const playbackState = await StorageService.getPlaybackState();

            if (playbackState) {
                const { episode, position } = playbackState;
                dispatch({ type: 'SET_EPISODE', payload: episode });
                dispatch({ type: 'SET_TIME', payload: position });
                console.log('Состояние воспроизведения восстановлено');
            }
        } catch (error) {
            console.error('Ошибка восстановления состояния:', error);
        }
    };

    // Обработчик статуса воспроизведения с улучшенной обработкой ошибок
    const onPlaybackStatusUpdate = (status: AVPlaybackStatus) => {
        try {
            if (status.isLoaded) {
                dispatch({ type: 'SET_TIME', payload: status.positionMillis || 0 });
                dispatch({ type: 'SET_DURATION', payload: status.durationMillis || 0 });
                dispatch({ type: 'SET_PLAYING', payload: status.isPlaying });
                dispatch({ type: 'SET_LOADING', payload: status.isBuffering });
                dispatch({ type: 'SET_ERROR', payload: null }); // Очищаем ошибку при успешном статусе

                // Периодическое сохранение позиции
                if (state.currentEpisode && status.positionMillis && status.isPlaying) {
                    savePlaybackState(state.currentEpisode, status.positionMillis);
                }
            } else if (!status.isLoaded && status.error) {
                console.error('Ошибка воспроизведения:', status.error);
                dispatch({ type: 'SET_ERROR', payload: 'Ошибка воспроизведения аудио' });
                dispatch({ type: 'SET_PLAYING', payload: false });
                dispatch({ type: 'SET_LOADING', payload: false });
            }
        } catch (error) {
            console.error('Ошибка в обработчике статуса воспроизведения:', error);
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
        } catch (error) {
            console.error('Ошибка извлечения URL потока:', error);
            return null;
        }
    };

    const playEpisode = async (episode: Episode, showDetails?: any) => {
        try {
            console.log('Начинаем воспроизведение эпизода:', episode.heading);
            dispatch({ type: 'SET_LOADING', payload: true });
            dispatch({ type: 'SET_ERROR', payload: null });

            // Очищаем только при смене эпизода
            if (!state.currentEpisode || state.currentEpisode.id !== episode.id) {
                try {
                    await notificationService.current.clearBeforeNewEpisode();
                } catch (error) {
                    console.error('Ошибка очистки уведомлений:', error);
                }
            }

            // Сохраняем данные о передаче
            if (showDetails) {
                dispatch({ type: 'SET_SHOW_DETAILS', payload: showDetails });
            }

            // Получаем URL потока
            const streamUrl = getStreamUrl(episode);
            if (!streamUrl) {
                throw new Error('Поток не найден или недоступен');
            }

            console.log('URL потока:', streamUrl);

            // Выгрузка предыдущего звука только если это другой эпизод
            if (soundRef.current && (!state.currentEpisode || state.currentEpisode.id !== episode.id)) {
                try {
                    await soundRef.current.unloadAsync();
                    soundRef.current = null;
                } catch (error) {
                    console.error('Ошибка выгрузки предыдущего звука:', error);
                }
            }

            // Создание нового звука только если это другой эпизод
            if (!state.currentEpisode || state.currentEpisode.id !== episode.id) {
                try {
                    const { sound } = await Audio.Sound.createAsync(
                        { uri: streamUrl },
                        {
                            shouldPlay: true,
                            progressUpdateIntervalMillis: 1000, // Обновляем прогресс каждую секунду
                            positionMillis: 0
                        },
                        onPlaybackStatusUpdate
                    );

                    soundRef.current = sound;
                    dispatch({ type: 'SET_EPISODE', payload: episode });

                    // Восстановление позиции если это тот же эпизод
                    const playbackState = await StorageService.getPlaybackState();
                    if (playbackState && playbackState.episode.id === episode.id && playbackState.position > 0) {
                        try {
                            await sound.setPositionAsync(playbackState.position);
                            console.log('Позиция восстановлена:', playbackState.position);
                        } catch (error) {
                            console.error('Ошибка восстановления позиции:', error);
                        }
                    }
                } catch (error) {
                    console.error('Ошибка создания звука:', error);
                    throw new Error('Не удалось загрузить аудиофайл');
                }
            } else {
                // Если тот же эпизод, просто возобновляем воспроизведение
                if (soundRef.current) {
                    try {
                        await soundRef.current.playAsync();
                    } catch (error) {
                        console.error('Ошибка возобновления воспроизведения:', error);
                        throw error;
                    }
                }
            }

            console.log('Эпизод успешно запущен');
        } catch (error) {
            console.error('Ошибка воспроизведения:', error);
            dispatch({ type: 'SET_ERROR', payload: 'Не удалось воспроизвести эпизод' });
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
            console.error('Ошибка паузы:', error);
            dispatch({ type: 'SET_ERROR', payload: 'Ошибка паузы воспроизведения' });
        }
    };

    const resumePlayback = async () => {
        try {
            if (soundRef.current) {
                await soundRef.current.playAsync();
            }
        } catch (error) {
            console.error('Ошибка возобновления:', error);
            dispatch({ type: 'SET_ERROR', payload: 'Ошибка возобновления воспроизведения' });
        }
    };

    const seekTo = async (position: number) => {
        try {
            if (soundRef.current) {
                await soundRef.current.setPositionAsync(position);
            }
        } catch (error) {
            console.error('Ошибка перемотки:', error);
            dispatch({ type: 'SET_ERROR', payload: 'Ошибка перемотки' });
        }
    };

    const togglePlayPause = async () => {
        try {
            if (!soundRef.current) {
                console.warn('Звуковой объект не инициализирован');
                return;
            }

            // Получаем актуальный статус воспроизведения напрямую из звукового объекта
            const status = await soundRef.current.getStatusAsync();

            if (status.isLoaded && status.isPlaying) {
                // Если играет - ставим на паузу
                console.log('Ставим на паузу из уведомления');
                await pausePlayback();
            } else if (status.isLoaded && !status.isPlaying) {
                // Если на паузе - возобновляем
                console.log('Возобновляем воспроизведение из уведомления');
                await resumePlayback();
            } else {
                console.warn('Неожиданное состояние аудио:', status);
            }
        } catch (error) {
            console.error('Ошибка переключения воспроизведения:', error);
            dispatch({ type: 'SET_ERROR', payload: 'Ошибка переключения воспроизведения' });
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
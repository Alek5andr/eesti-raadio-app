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
    const isInitialized = useRef<boolean>(false);
    const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

    // Инициализация аудио - УПРОЩЕННАЯ ВЕРСИЯ
    useEffect(() => {
        console.log(`${new Date()} - AudioContext audio useEffect begins`)
        const initAudio = async () => {
            if (isInitialized.current) return;

            try {
                console.log('Инициализация аудио...');

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
                        console.log('Нажатие на уведомление:', data);
                    },
                    async () => {
                        try {
                            await togglePlayPause();
                        } catch (error) {
                            console.error('Ошибка при переключении из уведомления:', error);
                        }
                    }
                );

                // Восстановление состояния - НЕ БЛОКИРУЕМ UI
                restorePlaybackState().catch(error => {
                    console.error('Ошибка восстановления состояния:', error);
                });

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

        initAudio().then((cleanup) => {
            removeListeners = cleanup;
        });

        // Обработка изменения состояния приложения
        const handleAppStateChange = (nextAppState: AppStateStatus) => {
            if (nextAppState === 'background' || nextAppState === 'inactive') {
                // Сохранение состояния при переходе в фон - НЕ БЛОКИРУЕМ
                if (state.currentEpisode && state.currentTime > 0) {
                    StorageService.savePlaybackState(
                        state.currentEpisode,
                        state.currentTime,
                        state.showDetails
                    ).catch(error => {
                        console.error('Ошибка сохранения в фоне:', error);
                    });
                }
            }
        };

        const appStateSubscription = AppState.addEventListener('change', handleAppStateChange);
        console.log(`${new Date()} - AudioContext audio useEffect ends`)

        console.log('AudioContext audio return useEffect begins')
        return () => {
            console.log('Очистка аудио контекста...');

            // Очистка таймера
            if (saveTimeoutRef.current) {
                clearTimeout(saveTimeoutRef.current);
            }

            // Очистка звука
            if (soundRef.current) {
                soundRef.current.unloadAsync().catch(console.error);
            }

            // Очистка уведомлений
            notificationService.current.hidePlayerNotification().catch(console.error);

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

            console.log('AudioContext audio return useEffect ends')
        };
    }, []); // БЕЗ ЗАВИСИМОСТЕЙ!

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

    // Обновление уведомлений - ДЕБАУНСИНГ
    useEffect(() => {
        console.log(`${new Date()} - AudioContext notification useEffect begins`)
        if (state.currentEpisode && state.isPlaying) {
            // Обновляем уведомление не чаще чем раз в секунду
            const updateNotification = () => {
                try {
                    const imageUrl = getImageUrl(state.currentEpisode, state.showDetails);
                    notificationService.current.showPlayerNotification(
                        state.currentEpisode,
                        state.isPlaying,
                        state.currentTime,
                        state.duration,
                        imageUrl
                    ).catch(console.error);
                } catch (error) {
                    console.error('Ошибка обновления уведомления:', error);
                }
            };

            updateNotification();
        }
        console.log(`${new Date()} - AudioContext notification useEffect ends`)
    }, [state.isPlaying, state.currentEpisode]); // Убираем частые обновления

    // Сохранение состояния с дебаунсингом
    const savePlaybackState = (episode: Episode, position: number) => {
        // Очищаем предыдущий таймер
        if (saveTimeoutRef.current) {
            clearTimeout(saveTimeoutRef.current);
        }

        // Сохраняем через 2 секунды после последнего обновления
        saveTimeoutRef.current = setTimeout(() => {
            StorageService.savePlaybackState(episode, position, state.showDetails)
                .catch(error => {
                    console.error('Ошибка сохранения состояния:', error);
                });
        }, 2000);
    };

    // Восстановление состояния - НЕ БЛОКИРУЮЩЕЕ
    const restorePlaybackState = async () => {
        try {
            const playbackState = await StorageService.getPlaybackState();
            if (playbackState) {
                const { episode, position, showDetails } = playbackState;
                dispatch({ type: 'SET_EPISODE', payload: episode });
                dispatch({ type: 'SET_TIME', payload: position });
                if (showDetails) {
                    dispatch({ type: 'SET_SHOW_DETAILS', payload: showDetails });
                }
                console.log('Состояние воспроизведения восстановлено');
            }
        } catch (error) {
            console.error('Ошибка восстановления состояния:', error);
        }
    };

    // Обработчик статуса воспроизведения - УПРОЩЕННЫЙ
    const onPlaybackStatusUpdate = (status: AVPlaybackStatus) => {
        // Используем setTimeout вместо requestAnimationFrame для менее частых обновлений
        setTimeout(() => {
            try {
                if (status.isLoaded) {
                    // Обновляем состояние пачками для меньшего количества рендеров
                    dispatch({ type: 'SET_TIME', payload: status.positionMillis || 0 });
                    dispatch({ type: 'SET_DURATION', payload: status.durationMillis || 0 });
                    dispatch({ type: 'SET_PLAYING', payload: status.isPlaying });

                    // Загрузку и ошибку обновляем только если изменились
                    if (state.isLoading !== status.isBuffering) {
                        dispatch({ type: 'SET_LOADING', payload: status.isBuffering });
                    }
                    if (state.error !== null) {
                        dispatch({ type: 'SET_ERROR', payload: null });
                    }

                    // Сохранение позиции с дебаунсингом
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
                console.error('Ошибка в обработчике статуса:', error);
            }
        }, 0);
    };

    const getStreamUrl = (episode: Episode): string | null => {
        try {
            const extractUrl = (srcObj: any): string | null => {
                if (!srcObj) return null;
                if (srcObj.file) return `https:${srcObj.file}`;
                if (srcObj.hls) return `https:${srcObj.hls}`;
                if (srcObj.hls2) return `https:${srcObj.hls2}`;
                if (srcObj.hlsNew) return `https:${srcObj.hlsNew}`;
                return null;
            };

            // Проверяем medias
            if (episode.medias && episode.medias.length > 0) {
                const media = episode.medias[0];
                if (media?.src) {
                    const url = extractUrl(media.src);
                    if (url) return url;
                }
            }

            // Проверяем clips
            if (episode.clips && episode.clips.length > 0) {
                const clip = episode.clips[0];
                if (clip?.medias && clip.medias.length > 0) {
                    const clipMedia = clip.medias[0];
                    if (clipMedia?.src) {
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
            console.log(`${new Date()} - Начинаем воспроизведение эпизода: ${episode.heading}`);
            dispatch({ type: 'SET_LOADING', payload: true });
            // Даем время UI показать состояние загрузки
            await new Promise(resolve => setTimeout(resolve, 100));
            dispatch({ type: 'SET_ERROR', payload: null });

            // Сохраняем данные о передаче
            if (showDetails) {
                dispatch({ type: 'SET_SHOW_DETAILS', payload: showDetails });
            }

            // Получаем URL потока
            const streamUrl = getStreamUrl(episode);
            if (!streamUrl) {
                throw new Error('Поток не найден или недоступен');
            }

            console.log(`${new Date()} - URL потока найден`);

            // Выгрузка предыдущего звука если это другой эпизод
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
                            progressUpdateIntervalMillis: 1000, // Обновляем каждую секунду, не чаще
                            positionMillis: 0
                        },
                        onPlaybackStatusUpdate
                    );

                    soundRef.current = sound;
                    dispatch({ type: 'SET_EPISODE', payload: episode });

                    // Восстановление позиции для этого эпизода - НЕ БЛОКИРУЮЩЕЕ
                    StorageService.getEpisodePosition(episode.id)
                        .then(episodeData => {
                            if (episodeData && episodeData.position > 0 && soundRef.current) {
                                soundRef.current.setPositionAsync(episodeData.position)
                                    .then(() => {
                                        console.log(`Позиция восстановлена для эпизода ${episode.id}:`, Math.floor(episodeData.position / 1000) + 'с');
                                    })
                                    .catch(error => {
                                        console.error('Ошибка восстановления позиции:', error);
                                    });
                            }
                        })
                        .catch(error => {
                            console.error('Ошибка получения сохраненной позиции:', error);
                        });

                } catch (error) {
                    console.error('Ошибка создания звука:', error);
                    throw new Error('Не удалось загрузить аудиофайл');
                }
            } else {
                // Если тот же эпизод, просто возобновляем воспроизведение
                if (soundRef.current) {
                    await soundRef.current.playAsync();
                }
            }

            console.log(`${new Date()} - Эпизод успешно запущен`);
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

            const status = await soundRef.current.getStatusAsync();

            if (status.isLoaded && status.isPlaying) {
                console.log('Ставим на паузу');
                await pausePlayback();
            } else if (status.isLoaded && !status.isPlaying) {
                console.log('Возобновляем воспроизведение');
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
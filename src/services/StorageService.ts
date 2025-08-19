import AsyncStorage from '@react-native-async-storage/async-storage';
import { Episode } from '../types';

export interface PlaybackState {
  episode: Episode;
  position: number;
  timestamp: number;
}

export class StorageService {
  private static readonly LAST_PLAYED_KEY = 'lastPlayedEpisode';
  private static readonly PLAYBACK_POSITION_KEY = 'playbackPosition';
  private static readonly PLAYBACK_TIMESTAMP_KEY = 'playbackTimestamp';

  static async savePlaybackState(episode: Episode, position: number): Promise<void> {
    try {
      const state: PlaybackState = {
        episode,
        position,
        timestamp: Date.now(),
      };

      await AsyncStorage.multiSet([
        [this.LAST_PLAYED_KEY, JSON.stringify(episode)],
        [this.PLAYBACK_POSITION_KEY, position.toString()],
        [this.PLAYBACK_TIMESTAMP_KEY, Date.now().toString()],
      ]);
    } catch (error) {
      console.error('Ошибка сохранения состояния воспроизведения:', error);
    }
  }

  static async getPlaybackState(): Promise<PlaybackState | null> {
    try {
      const [episodeData, positionData, timestampData] = await AsyncStorage.multiGet([
        this.LAST_PLAYED_KEY,
        this.PLAYBACK_POSITION_KEY,
        this.PLAYBACK_TIMESTAMP_KEY,
      ]);

      const episodeJson = episodeData[1];
      const positionString = positionData[1];
      const timestampString = timestampData[1];

      if (!episodeJson || !positionString || !timestampString) {
        return null;
      }

      const episode = JSON.parse(episodeJson);
      const position = parseFloat(positionString);
      const timestamp = parseInt(timestampString);

      return {
        episode,
        position,
        timestamp,
      };
    } catch (error) {
      console.error('Ошибка загрузки состояния воспроизведения:', error);
      return null;
    }
  }

  static async clearPlaybackState(): Promise<void> {
    try {
      await AsyncStorage.multiRemove([
        this.LAST_PLAYED_KEY,
        this.PLAYBACK_POSITION_KEY,
        this.PLAYBACK_TIMESTAMP_KEY,
      ]);
    } catch (error) {
      console.error('Ошибка очистки состояния воспроизведения:', error);
    }
  }

  static async saveAppState(key: string, value: any): Promise<void> {
    try {
      await AsyncStorage.setItem(key, JSON.stringify(value));
    } catch (error) {
      console.error(`Ошибка сохранения состояния приложения (${key}):`, error);
    }
  }

  static async getAppState<T>(key: string): Promise<T | null> {
    try {
      const value = await AsyncStorage.getItem(key);
      return value ? JSON.parse(value) : null;
    } catch (error) {
      console.error(`Ошибка загрузки состояния приложения (${key}):`, error);
      return null;
    }
  }
}
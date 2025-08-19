export interface Show {
    id: string;
    heading: string;
    photos: Photo[];
}

interface Photo {
    photoTypes: {
        36: {
            url: string;
        };
    }
}

export interface Category {
    header: string;
    data: Show[];
}

export interface Episode {
    id: string;
    heading: string;
    body: string;
    publicStart: number;
    duration: number;
    photos: {
        photoTypes: {
            36: {
                url: string;
            },
            4: {
                url: string;
            };
        };
    };
    medias?: Array<{
        src: string;
    }>;
    clips?: Array<{
        medias: Array<{
            src: string;
        }>;
    }>;
}

export interface ShowDetails {
    id: string;
    heading: string;
    episodeList: Episode[];
}

export interface AudioState {
    isPlaying: boolean;
    currentTime: number;
    duration: number;
    currentEpisode: Episode | null;
    isLoading: boolean;
    showDetails: any | null;
    error: string | null; // Добавьте это поле
}
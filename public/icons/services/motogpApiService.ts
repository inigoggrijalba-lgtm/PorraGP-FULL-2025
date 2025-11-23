
import type { CircuitResult, RaceResult, LiveTimingData, ApiSeason, ApiCategory, ApiRider, RiderStats, RiderSeasonStat, ApiEvent, ApiCategoryResult, ApiEventResult, ApiSessionResult, ApiClassificationResponse, ApiBroadcastEvent } from '../types';

const PROXY_URL = 'https://autumn-shape-d3e8.inigoggrijalba.workers.dev/?url=';
const API_BASE_URL = 'https://api.motogp.pulselive.com/motogp/v1';

// Puntos basados en la normativa oficial de MotoGP
const SPRINT_POINTS = [12, 9, 7, 6, 5, 4, 3, 2, 1];
const RACE_POINTS = [25, 20, 16, 13, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1];

const getPoints = (position: number, type: 'sprint' | 'race'): number => {
    if (type === 'sprint') {
        return position > 0 && position <= SPRINT_POINTS.length ? SPRINT_POINTS[position - 1] : 0;
    } else {
        return position > 0 && position <= RACE_POINTS.length ? RACE_POINTS[position - 1] : 0;
    }
};

const apiFetch = async <T>(endpoint: string): Promise<T> => {
    const url = `${PROXY_URL}${encodeURIComponent(`${API_BASE_URL}${endpoint}`)}`;
    const response = await fetch(url);
    if (!response.ok) {
        throw new Error(`Error en la API de MotoGP: ${response.status} - ${response.statusText}`);
    }
    return response.json() as Promise<T>;
};

export const fetchOfficialResults = async (): Promise<CircuitResult[]> => {
    try {
        const seasons = await apiFetch<any[]>('/results/seasons');
        const currentSeason = seasons.find(s => s.current);
        if (!currentSeason) throw new Error('No se encontró la temporada actual.');

        const categories = await apiFetch<any[]>(`/results/categories?seasonUuid=${currentSeason.id}`);
        const motogpCategory = categories.find(c => c.name === 'MotoGP™');
        if (!motogpCategory) throw new Error('No se encontró la categoría de MotoGP.');

        const events = await apiFetch<any[]>(`/results/events?seasonUuid=${currentSeason.id}`);

        const resultsPromises = events.map(async (event): Promise<CircuitResult | null> => {
            try {
                const sessions = await apiFetch<any[]>(`/results/sessions?eventUuid=${event.id}&categoryUuid=${motogpCategory.id}`);
                
                const raceSession = sessions.find(s => s.type === 'RAC');
                const sprintSession = sessions.find(s => s.type === 'SPR');

                let raceResults: RaceResult[] = [];
                let sprintResults: RaceResult[] = [];

                if (raceSession) {
                    const classificationData = await apiFetch<any>(`/results/session/${raceSession.id}/classification`);
                    raceResults = classificationData.classification.map((item: any): RaceResult => ({
                        position: item.position,
                        driver: item.rider.full_name,
                        points: getPoints(item.position, 'race')
                    }));
                }

                if (sprintSession) {
                    const classificationData = await apiFetch<any>(`/results/session/${sprintSession.id}/classification`);
                    sprintResults = classificationData.classification.map((item: any): RaceResult => ({
                        position: item.position,
                        driver: item.rider.full_name,
                        points: getPoints(item.position, 'sprint')
                    }));
                }

                return {
                    circuit: event.circuit.name,
                    sprint: sprintResults,
                    race: raceResults
                };
            } catch (error) {
                console.warn(`No se pudieron obtener los resultados para ${event.circuit.name}:`, error);
                return {
                    circuit: event.circuit.name,
                    sprint: [],
                    race: []
                }; // Devuelve un resultado vacío para este evento en caso de error
            }
        });

        const allResults = await Promise.all(resultsPromises);
        return allResults.filter((result): result is CircuitResult => result !== null);

    } catch (error) {
        console.error("Error grave al obtener los resultados oficiales de MotoGP:", error);
        throw new Error("No se pudieron cargar los resultados oficiales de MotoGP desde la API.");
    }
};

export const fetchLiveTiming = async (): Promise<LiveTimingData> => {
    const url = `${PROXY_URL}${encodeURIComponent('https://api.motogp.pulselive.com/motogp/v1/timing-gateway/livetiming-lite')}`;
    const response = await fetch(url);
    if (!response.ok) {
        throw new Error('Error al obtener los datos de Live Timing.');
    }
    return response.json();
};


// --- Funciones para MotoGp Data Tab (Results API) ---

export const fetchSeasons = async (): Promise<ApiSeason[]> => {
    const seasons = await apiFetch<ApiSeason[]>('/results/seasons');
    return seasons.sort((a, b) => b.year - a.year);
};

export const fetchResultCategories = async (seasonId: string): Promise<ApiCategoryResult[]> => {
    return apiFetch<ApiCategoryResult[]>(`/results/categories?seasonUuid=${seasonId}`);
};

export const fetchResultEvents = async (seasonId: string): Promise<ApiEventResult[]> => {
    return apiFetch<ApiEventResult[]>(`/results/events?seasonUuid=${seasonId}`);
};

export const fetchResultSessions = async (eventId: string, categoryId: string): Promise<ApiSessionResult[]> => {
    return apiFetch<ApiSessionResult[]>(`/results/sessions?eventUuid=${eventId}&categoryUuid=${categoryId}`);
};

export const fetchSessionClassification = async (sessionId: string): Promise<ApiClassificationResponse> => {
    return apiFetch<ApiClassificationResponse>(`/results/session/${sessionId}/classification?test=false`);
};


// --- Funciones Broadcast/Riders (NUEVO) ---

export const fetchAllRiders = async (): Promise<ApiRider[]> => {
    return apiFetch<ApiRider[]>('/riders');
};

export const fetchBroadcastEvents = async (seasonYear: number): Promise<ApiBroadcastEvent[]> => {
    return apiFetch<ApiBroadcastEvent[]>(`/events?seasonYear=${seasonYear}`);
};

// --- Funciones Legacy (se mantienen para detalles específicos) ---

export const fetchRidersBySeason = async (seasonYear: number, categoryName: string = 'MotoGP'): Promise<ApiRider[]> => {
    // 1. Obtener el ID de la categoría para el año seleccionado.
    const categories = await apiFetch<ApiCategory[]>(`/categories?seasonYear=${seasonYear}`);
    
    // Ajustar búsqueda para que coincida con la API (MotoGP™, Moto2™, etc.)
    const normalizedSearchName = categoryName.toLowerCase();
    const targetCategory = categories.find(c => c.name.toLowerCase().includes(normalizedSearchName));
    
    if (!targetCategory) {
        throw new Error(`No se encontró la categoría ${categoryName} para el año ${seasonYear}.`);
    }

    // 2. Obtener los equipos (y sus pilotos) para esa temporada y categoría.
    const teams = await apiFetch<any[]>(`/teams?categoryUuid=${targetCategory.id}&seasonYear=${seasonYear}`);

    // 3. Extraer y aplanar la lista de pilotos.
    const allRiders = teams.flatMap(team => team.riders || []);

    // 4. Eliminar duplicados usando un Map, por si un piloto aparece en más de un equipo.
    const uniqueRiders = new Map<string, ApiRider>();
    allRiders.forEach(rider => {
        if (rider.id && !uniqueRiders.has(rider.id)) {
            uniqueRiders.set(rider.id, rider);
        }
    });

    return Array.from(uniqueRiders.values());
};

export const fetchRiderDetails = async (riderId: string): Promise<ApiRider> => {
    return apiFetch<ApiRider>(`/riders/${riderId}`);
};

export const fetchRiderStats = async (legacyId: number): Promise<RiderStats> => {
    return apiFetch<RiderStats>(`/riders/${legacyId}/stats`);
};

export const fetchRiderSeasonStats = async (legacyId: number): Promise<RiderSeasonStat[]> => {
    return apiFetch<RiderSeasonStat[]>(`/riders/${legacyId}/statistics`);
};

export const fetchEventsBySeason = async (year: number): Promise<ApiEvent[]> => {
    return apiFetch<ApiEvent[]>(`/events?seasonYear=${year}`);
};

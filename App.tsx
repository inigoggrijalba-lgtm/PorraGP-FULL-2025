
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { chatWithData } from './services/geminiService';
<<<<<<< HEAD
import { fetchSeasons, fetchRidersBySeason, fetchRiderDetails, fetchLiveTiming, fetchRiderStats, fetchRiderSeasonStats } from './services/motogpApiService';
import type { MotoGpData, Race, PlayerScore, PlayerVote, DriverVoteCount, ChatMessage, RaceResult, CircuitResult, Article, ApiSeason, ApiRider, LiveTimingHead, RiderStats, RiderSeasonStat } from './types';
=======
import { fetchSeasons, fetchRidersBySeason, fetchRiderDetails, fetchLiveTiming } from './services/motogpApiService';
import type { MotoGpData, Race, PlayerScore, PlayerVote, DriverVoteCount, ChatMessage, RaceResult, CircuitResult, Article, ApiSeason, ApiRider, LiveTimingHead } from './types';
>>>>>>> 5e55e5db80ef275d7cb0e2af7240d03da966d253
import { TrophyIcon, TableIcon, SparklesIcon, SendIcon, RefreshIcon, FlagIcon, UserIcon, PencilSquareIcon, MenuIcon, XIcon, NewspaperIcon, AppleIcon, AndroidIcon, IosShareIcon, AddToScreenIcon, AppleAppStoreBadge, GooglePlayBadge, CameraIcon, ShareIcon, DownloadIcon, FullscreenIcon, FullscreenExitIcon } from './components/icons';

declare var html2canvas: any;

const SHEET_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vQAqF8HCmEs0iGvEO0jItWZl_PfIF2Igy8PoNhEnQjB-C92vCyWvSMRB00FpsNseEA8T-7Ip4GfDPf3/pub?gid=0&single=true&output=csv';

const RIDER_COLORS: Record<string, string> = {
    // Rojo Intenso
    'Bagnaia': '#D40000', 'M.Marquez': '#D40000',
    // Verde
    'Martin': '#00A651', 'Bezzecchi': '#00A651',
    // Azul Clarisimo
    'A.Marquez': '#75C9D9', 'Aldeguer': '#75C9D9',
    // Blanco
    'Zarco': '#FFFFFF', 'Chantra': '#FFFFFF',
    // Azul Intenso
    'Quartararo': '#0033A0', 'Rins': '#0033A0',
    // Amarillo
    'Di Giannantonio': '#FDEE00', 'Morbidelli': '#FDEE00',
    // Morado
    'Oliveira': '#8A2BE2', 'Miller': '#8A2BE2',
    // Naranja
    'Binder': '#FF6600', 'Acosta': '#FF6600', 'Bastianini': '#FF6600', 'Viñales': '#FF6600',
    // Naranja Clarito
    'Marini': '#f58025', 'Mir': '#f58025',
    // Azul
    'R.Fernandez': '#002868', 'Fernandez': '#002868', 'Ogura': '#002868',
    'DEFAULT': '#4B5563',
};

// Paleta de colores para la gráfica de estadísticas
const PLAYER_CHART_COLORS = [
    '#34D399', '#F87171', '#60A5FA', '#FBBF24', '#A78BFA',
    '#F472B6', '#2DD4BF', '#F97316', '#EC4899', '#14B8A6',
    '#8B5CF6', '#D946EF', '#6EE7B7'
];

const getRiderColor = (riderName: string): string => {
    // Normalize the input name by making it lowercase and removing spaces and dots for robust matching.
    const normalizedRiderName = riderName.toLowerCase().replace(/[.\s]/g, '');
    let bestMatchKey: string | null = null;
    let bestMatchLength = 0;

    for (const key of Object.keys(RIDER_COLORS)) {
        if (key === 'DEFAULT') continue;

        // Normalize the key from the color map in the same way.
        const normalizedKey = key.toLowerCase().replace(/[.\s]/g, '');

        // Check if the normalized data name includes the normalized key.
        // This allows matching "rfernandez" from data to the key "fernandez".
        if (normalizedRiderName.includes(normalizedKey)) {
            // If it's a match, see if it's better than the current best match.
            // A longer key is a more specific, and therefore better, match.
            if (normalizedKey.length > bestMatchLength) {
                bestMatchKey = key;
                bestMatchLength = normalizedKey.length;
            }
        }
    }

    return bestMatchKey ? RIDER_COLORS[bestMatchKey] : RIDER_COLORS.DEFAULT;
};


const parseCsvData = (csvText: string): MotoGpData => {
    const lines = csvText.trim().replace(/\r/g, '').split('\n');
    const dataGrid = lines.map(line => line.split(','));

    // --- Carreras ---
    const raceDates = dataGrid[0].slice(2, 24);
    const raceTimes = dataGrid[1].slice(2, 24);
    const raceCircuits = dataGrid[2].slice(2, 24);
    const races: Race[] = raceCircuits.map((circuit, i) => ({
        circuit: circuit.trim(),
        date: raceDates[i]?.trim() || 'TBC',
        time: raceTimes[i]?.trim() || 'TBC',
    })).filter(r => r.circuit);

    // --- Clasificación ---
    const standings: PlayerScore[] = [];
    for (let i = 3; i < 16; i++) {
        if (!dataGrid[i] || !dataGrid[i][0]) continue;
        const row = dataGrid[i];
        const pointsPerRace = row.slice(2, 24).map(p => parseFloat(p) || 0);
        // Se calcula el total de puntos sumando los puntos de cada carrera,
        // ignorando el total precalculado en la hoja de cálculo.
        const totalPoints = pointsPerRace.reduce((sum, current) => sum + current, 0);
        standings.push({
            player: row[0].trim(),
            totalPoints: totalPoints,
            pointsPerRace: pointsPerRace,
        });
    }
    standings.sort((a, b) => b.totalPoints - a.totalPoints);


    // --- Votos de Jugadores ---
    const playerVotes: PlayerVote[] = [];
    for (let i = 17; i < 30; i++) {
        if (!dataGrid[i] || !dataGrid[i][0]) continue;
        const row = dataGrid[i];
        playerVotes.push({
            player: row[0].trim(),
            votesPerRace: row.slice(2, 24).map(v => v.trim()),
        });
    }

    // --- Recuento de Votos por Piloto ---
    const driverVoteCounts: DriverVoteCount[] = [];
    const allDrivers = dataGrid[32].slice(2).map(d => d.trim()).filter(Boolean);
    for (let i = 33; i < 46; i++) {
        if (!dataGrid[i] || !dataGrid[i][2]) continue;
        const playerRow = dataGrid[i];
        const votingPlayer = playerRow[0].trim();
        const votes = playerRow.slice(2);

        votes.forEach((countStr, j) => {
            const driverName = allDrivers[j];
            if (!driverName) return;
            const count = parseInt(countStr) || 0;
            if (count > 0) {
                let driver = driverVoteCounts.find(d => d.driver === driverName);
                if (!driver) {
                    driver = { driver: driverName, votesByPlayer: {}, totalVotes: 0 };
                    driverVoteCounts.push(driver);
                }
                driver.votesByPlayer[votingPlayer] = count;
                driver.totalVotes += count;
            }
        });
    }
     // Asegurarse de que todos los pilotos estén en la lista, incluso con 0 votos
    allDrivers.forEach(driverName => {
        if (!driverVoteCounts.some(d => d.driver === driverName)) {
            driverVoteCounts.push({ driver: driverName, votesByPlayer: {}, totalVotes: 0 });
        }
    });

    driverVoteCounts.sort((a, b) => b.totalVotes - a.totalVotes);

    // --- Resultados Oficiales MotoGP ---
    const motogpResults: CircuitResult[] = [];
    const sprintPoints = [12, 9, 7, 6, 5, 4, 3, 2, 1];
    const racePoints = [25, 20, 16, 13, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1];

    races.forEach((race, raceIndex) => {
        const columnIndex = raceIndex + 2;
        const sprintResults: RaceResult[] = [];
        // SPRINT results from row 50 (index 49)
        for (let i = 0; i < 10; i++) {
            const driverRow = 49 + i;
            if (dataGrid[driverRow] && dataGrid[driverRow][columnIndex]?.trim()) {
                sprintResults.push({
                    position: i + 1,
                    driver: dataGrid[driverRow][columnIndex].trim(),
                    points: sprintPoints[i] || 0,
                });
            }
        }

        const raceResults: RaceResult[] = [];
        // RACE results from row 60 (index 59)
        for (let i = 0; i < 10; i++) {
            const driverRow = 59 + i;
            if (dataGrid[driverRow] && dataGrid[driverRow][columnIndex]?.trim()) {
                raceResults.push({
                    position: i + 1,
                    driver: dataGrid[driverRow][columnIndex].trim(),
                    points: racePoints[i] || 0,
                });
            }
        }

        motogpResults.push({
            circuit: race.circuit,
            sprint: sprintResults,
            race: raceResults,
        });
    });

    return { races, standings, playerVotes, driverVoteCounts, motogpResults, allDrivers };
};


type Tab = 'dashboard' | 'standings' | 'statistics' | 'circuits' | 'participantes' | 'motogp_results' | 'votar' | 'livetiming' | 'noticias' | 'info_prueba';

const TABS: { name: string; tab: Tab }[] = [
    { name: "Inicio", tab: "dashboard" },
    { name: "Clasificación Porra", tab: "standings" },
    { name: "Votar", tab: "votar" },
    { name: "Resultados Porra", tab: "circuits" },
    { name: "Resultados MGP", tab: "motogp_results" },
    { name: "Votos pilotos", tab: "participantes" },
    { name: "Estadísticas", tab: "statistics" },
    { name: "Noticias", tab: "noticias" },
    { name: "Info Prueba", tab: "info_prueba" },
];

// Se ha extraído el botón de actualizar a su propio componente para mayor claridad y reutilización.
function RefreshButton({ onClick, isLoading }: { onClick: () => void; isLoading: boolean }) {
    return (
        <button
            onClick={onClick}
            disabled={isLoading}
            className="bg-gray-700 hover:bg-gray-600 text-white font-bold py-2 px-4 rounded-lg transition-colors flex items-center disabled:bg-gray-500 disabled:cursor-not-allowed"
            aria-label={isLoading ? "Cargando datos" : "Actualizar datos"}
        >
            <RefreshIcon className={`w-5 h-5 ${isLoading ? 'animate-spin' : ''} mr-2`} />
            <span className="hidden sm:inline">{isLoading ? '...' : 'Actualizar'}</span>
        </button>
    );
}

function App() {
    const [motoGpData, setMotoGpData] = useState<MotoGpData | null>(null);
    const [rawCsv, setRawCsv] = useState<string>('');
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [activeTab, setActiveTab] = useState<Tab>('dashboard');
    const [isMenuOpen, setIsMenuOpen] = useState(false);
    const [isChatOpen, setIsChatOpen] = useState(false);

    const fetchData = useCallback(async () => {
        setIsLoading(true);
        setError(null);
        try {
            // Se añade un parámetro a la URL para evitar problemas de caché
            const url = `${SHEET_URL}&_=${new Date().getTime()}`;
            const response = await fetch(url);
            if (!response.ok) {
                throw new Error(`Error al obtener los datos (código ${response.status}).`);
            }
            const text = await response.text();
            setRawCsv(text);
            const data = parseCsvData(text);
            setMotoGpData(data);
        } catch (err: any) {
            setError(err.message || 'Ocurrió un error al procesar los datos.');
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchData();
        
        if ('serviceWorker' in navigator) {
            window.addEventListener('load', () => {
                // Usamos la variable de entorno BASE_URL de Vite para construir la ruta correcta.
                // Se añade optional chaining y un fallback para entornos donde vite no inyecta las variables.
                const baseUrl = import.meta.env?.BASE_URL ?? '/PorraGP-FULL-2025/';
                const swUrl = `${baseUrl}service-worker.js`;
                navigator.serviceWorker.register(swUrl)
                    .then(registration => {
                        console.log('ServiceWorker registrado correctamente en:', registration.scope);
                    })
                    .catch(err => {
                        console.error('Error en el registro de ServiceWorker:', err);
                    });
            });
        }

    }, [fetchData]);

    const handleSetTab = (tab: Tab) => {
        setActiveTab(tab);
        setIsMenuOpen(false);
    }

    const renderContent = () => {
        // Redirige a la pestaña de Live Timing si se solicita específicamente
        if (activeTab === 'livetiming') {
            return <LiveTimingTab />;
        }
        if (isLoading) {
            return (
                <div className="text-center">
                    <div className="w-16 h-16 border-4 border-dashed rounded-full animate-spin border-red-500 mx-auto"></div>
                    <p className="mt-4 text-lg text-gray-300 font-orbitron">Arrancando motores...</p>
                </div>
            );
        }
        if (error) {
            return <p className="text-center text-red-400">{error}</p>;
        }
        if (!motoGpData) {
            return <p className="text-center text-gray-400">No se han podido cargar los datos.</p>;
        }

        switch (activeTab) {
            case 'dashboard':
                return <DashboardTab data={motoGpData} setActiveTab={setActiveTab} />;
            case 'standings':
                return <StandingsTab data={motoGpData} />;
            case 'statistics':
                return <StatisticsTab data={motoGpData} />;
            case 'circuits':
                 return <CircuitsTab data={motoGpData} />;
            case 'participantes':
                 return <ParticipantesTab data={motoGpData} />;
            case 'motogp_results':
                 return <MotoGpResultsTab data={motoGpData} />;
             case 'votar':
                return <VotarTab />;
            case 'noticias':
                return <NewsTab />;
            case 'info_prueba':
                return <InfoPruebaTab data={motoGpData} />;
            default:
                return null;
        }
    };

    return (
        <div className={`min-h-screen w-full flex flex-col ${activeTab !== 'livetiming' ? 'p-4 sm:p-8' : ''}`}>
            <header className={`w-full max-w-7xl mx-auto flex justify-between items-center mb-8 ${activeTab === 'livetiming' ? 'hidden' : ''}`}>
                <button 
                    onClick={() => handleSetTab('dashboard')} 
                    className="group text-2xl sm:text-4xl font-bold font-orbitron text-white text-left focus:outline-none"
                >
                    <span className="transition-colors duration-300 group-hover:motogp-red">Porra</span>
                    <span className="motogp-red transition-colors duration-300 group-hover:text-white">GP</span>
                </button>
                <RefreshButton onClick={fetchData} isLoading={isLoading} />
            </header>

            <main className={`w-full flex-grow flex flex-col ${activeTab !== 'livetiming' ? 'max-w-7xl mx-auto' : ''}`}>
                <div className={`flex justify-between items-center ${activeTab === 'livetiming' ? 'px-4 sm:px-8 py-4' : 'mb-8 border-b border-gray-700'}`}>
                    {/* Mobile Menu Button & Dropdown */}
                    <div className={`sm:hidden relative ${activeTab === 'livetiming' ? 'hidden' : ''}`}>
                        <button onClick={() => setIsMenuOpen(o => !o)} className="p-2 text-gray-400 hover:text-white">
                             <MenuIcon className="w-6 h-6" />
                        </button>
                        {isMenuOpen && (
                            <>
                                {/* Backdrop to close menu on click outside */}
                                <div className="fixed inset-0 z-40" onClick={() => setIsMenuOpen(false)} />
                                <div
                                    className="absolute left-0 mt-2 w-56 origin-top-left rounded-md shadow-lg card-bg ring-1 ring-black ring-opacity-5 z-50"
                                >
                                    <div className="py-1" role="menu" aria-orientation="vertical">
                                        {TABS.map(({name, tab}) => (
                                            <button
                                                key={tab}
                                                onClick={() => handleSetTab(tab)}
                                                className={`${
                                                    activeTab === tab ? 'motogp-red bg-gray-900/50' : 'text-gray-300'
                                                } block w-full text-left px-4 py-4 text-lg hover:bg-gray-700/80 transition-colors`}
                                                role="menuitem"
                                            >
                                                {name}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            </>
                        )}
                    </div>

                    {/* Desktop Tabs */}
                    <nav className={`hidden sm:flex -mb-px space-x-6 overflow-x-auto ${activeTab === 'livetiming' ? 'hidden' : ''}`} aria-label="Tabs">
                         {TABS.map(({ name, tab }) => (
                            <TabButton
                                key={tab}
                                name={name}
                                tab={tab}
                                activeTab={activeTab}
                                setActiveTab={handleSetTab}
                            />
                        ))}
                    </nav>
                     {activeTab === 'livetiming' ? (
                        <button
                            onClick={() => handleSetTab('dashboard')}
                            className="bg-gray-700 hover:bg-gray-600 text-white font-bold py-2 px-4 rounded-lg transition-colors text-sm whitespace-nowrap"
                        >
                            &larr; Volver
                        </button>
                    ) : (
                        <button
                            onClick={() => setActiveTab('livetiming')}
                            className="motogp-red-bg text-white font-bold py-2 px-4 rounded-lg transition-colors text-sm whitespace-nowrap hover:bg-red-700"
                        >
                            LiveTiming
                        </button>
                    )}
                </div>
                {renderContent()}
            </main>
            
            <footer className={`w-full max-w-7xl mx-auto mt-8 text-center text-xs text-gray-500 flex-shrink-0 ${activeTab === 'livetiming' ? 'hidden' : ''}`}>
                 <p>Versión de compilación: {import.meta.env?.BUILD_TIMESTAMP ?? 'local'}</p>
            </footer>

             <ChatBubbleButton onClick={() => setIsChatOpen(true)} />
            {isChatOpen && motoGpData && (
                <ChatWindow
                    onClose={() => setIsChatOpen(false)}
                    data={motoGpData}
                    rawCsv={rawCsv}
                />
            )}
        </div>
    );
}

interface TabButtonProps {
    name: string;
    tab: Tab;
    activeTab: Tab;
    setActiveTab: (tab: Tab) => void;
}

const TabButton: React.FC<TabButtonProps> = ({ name, tab, activeTab, setActiveTab}) => {
    return (
        <button
            onClick={() => setActiveTab(tab)}
            className={`${
                activeTab === tab
                ? 'border-red-500 motogp-red'
                : 'border-transparent text-gray-400 hover:text-gray-200 hover:border-gray-500'
            } whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm transition-colors`}
        >
            {name}
        </button>
    )
}

// --- TABS ---

function InstallAppCard({ onOpenModal }: { onOpenModal: (os: 'android' | 'ios') => void }) {
    return (
        <div className="mt-8">
            <div 
                className="p-6 rounded-xl shadow-lg flex flex-col sm:flex-row items-center justify-between gap-6 border border-white/50" 
                style={{
                    backgroundColor: 'rgba(55, 55, 55, 0.8)',
                    backdropFilter: 'blur(10px)',
                }}
            >
                <h2 className="font-orbitron text-xl text-white text-center sm:text-left">
                    <span className="motogp-red">Descarga</span> la aplicación<br/>oficial de Porra<span className="motogp-red">GP</span>™
                </h2>
                <div className="flex items-center gap-4">
                    <button onClick={() => onOpenModal('ios')} className="transition-transform hover:scale-105 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-800 focus:ring-white rounded-lg" aria-label="Instalar en Apple">
                        <AppleAppStoreBadge className="h-12" />
                    </button>
                    <button onClick={() => onOpenModal('android')} className="transition-transform hover:scale-105 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-800 focus:ring-white rounded-lg" aria-label="Instalar en Android">
                        <GooglePlayBadge className="h-12" />
                    </button>
                </div>
            </div>
        </div>
    );
}

function InstallInstructionsModal({ os, onClose }: { os: 'android' | 'ios'; onClose: () => void; }) {
    const isAndroid = os === 'android';
    const title = isAndroid ? 'Instalar en Android' : 'Instalar en iPhone/iPad';
    const icon = isAndroid ? <AndroidIcon className="w-10 h-10 text-green-400" /> : <AppleIcon className="w-10 h-10 text-blue-400" />;
    
    const instructions = isAndroid ? (
        <ol className="list-decimal list-inside space-y-3 text-gray-200">
            <li>Haz clic en los <strong>tres puntitos</strong> de la parte alta del navegador.</li>
            <li>Busca y selecciona la opción <strong>"Añadir a pantalla de inicio"</strong>.</li>
            <li>Pulsa en <strong>"Instalar"</strong>.</li>
            <li>¡Listo! Ya puedes acceder a PorraGP como una app más.</li>
        </ol>
    ) : (
        <ol className="list-decimal list-inside space-y-3 text-gray-200">
            <li>Abre esta página en <strong>Safari</strong>.</li>
            <li>Pulsa el botón de <strong>Compartir</strong> <IosShareIcon className="w-5 h-5 inline-block mx-1" />.</li>
            <li>Busca y selecciona la opción <strong>"Añadir a pantalla de inicio"</strong> <AddToScreenIcon className="w-5 h-5 inline-block mx-1" />.</li>
            <li>Confirma pulsando en "Añadir".</li>
        </ol>
    );

    return (
        <div className="fixed inset-0 bg-black/70 z-50 flex justify-center items-center p-4" onClick={onClose}>
            <div className="card-bg rounded-xl shadow-2xl w-full max-w-md" onClick={e => e.stopPropagation()}>
                <header className="p-4 border-b border-gray-700 flex justify-between items-center">
                    <h2 className="font-orbitron text-lg text-white">{title}</h2>
                    <button onClick={onClose} className="text-gray-400 hover:text-white text-2xl leading-none">&times;</button>
                </header>
                <div className="p-6">
                    <div className="flex items-center gap-4 mb-4">
                        <div className="p-2 bg-gray-800 rounded-lg flex-shrink-0">{icon}</div>
                        <p className="text-gray-300">Sigue estos sencillos pasos para tener acceso directo a la aplicación.</p>
                    </div>
                    <div className="bg-gray-900/50 p-4 rounded-lg border border-gray-700">
                        {instructions}
                    </div>
                </div>
            </div>
        </div>
    );
}


function DashboardTab({ data, setActiveTab }: { data: MotoGpData, setActiveTab: (tab: Tab) => void }) {
    const [selectedPlayer, setSelectedPlayer] = useState<string | null>(null);
    const [installModalOS, setInstallModalOS] = useState<'android' | 'ios' | null>(null);

    const leader = data.standings && data.standings.length > 0 ? data.standings[0] : undefined;
    const mostVotedDriver = data.driverVoteCounts && data.driverVoteCounts.length > 0 ? data.driverVoteCounts[0] : undefined;
    
    const nextRaceInfo = useMemo(() => {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const futureRaces = data.races.filter(r => {
            if (!r.date || r.date === 'TBC') return false;
            const parts = r.date.split('/');
            if (parts.length !== 3) return false;
            const [day, month, year] = parts;
            const raceDate = new Date(Number(year), Number(month) - 1, Number(day));
            if (isNaN(raceDate.getTime())) return false;
            return raceDate >= today;
        });

        if (futureRaces.length > 0) {
            return { race: futureRaces[0], seasonOver: false };
        }
        return { race: null, seasonOver: true };
    }, [data.races]);
    
    const votesForNextRace = useMemo(() => {
        if (!nextRaceInfo.race) return [];
        const nextRaceIndex = data.races.findIndex(r => r.circuit === nextRaceInfo.race.circuit);
        if (nextRaceIndex === -1) return [];

        return data.playerVotes.map(playerVote => ({
            player: playerVote.player,
            vote: playerVote.votesPerRace[nextRaceIndex] || '-',
        })).sort((a, b) => a.player.localeCompare(b.player));
    }, [data, nextRaceInfo.race]);

    return (
        <>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
                <StatCard title="Líder del Campeonato" value={leader ? leader.player : 'N/A'} metric={leader ? `${leader.totalPoints} Pts` : '-'} icon={<TrophyIcon className="w-6 h-6 sm:w-8 sm:h-8"/>} />
                <StatCard 
                    title="Próxima Carrera" 
                    value={nextRaceInfo.seasonOver ? 'TEMPORADA FINALIZADA' : (nextRaceInfo.race?.circuit ?? 'N/A')} 
                    metric={nextRaceInfo.seasonOver ? 'Gracias por participar' : (nextRaceInfo.race ? `${nextRaceInfo.race.date} - ${nextRaceInfo.race.time}` : 'TBC')} 
                    icon={<FlagIcon className="w-6 h-6 sm:w-8 sm:h-8"/>} 
                />
                <StatCard title="Piloto más Votado (Global)" value={mostVotedDriver ? mostVotedDriver.driver : 'N/A'} metric={mostVotedDriver ? `${mostVotedDriver.totalVotes} Votos` : '-'} icon={<SparklesIcon className="w-6 h-6 sm:w-8 sm:h-8"/>} />
                <button
                    onClick={() => setActiveTab('votar')}
                    className="card-bg p-4 sm:p-6 rounded-xl shadow-lg flex items-center space-x-4 border-t-4 border-green-500 hover:bg-gray-800/60 hover:shadow-green-900/50 transition-all duration-300 transform hover:-translate-y-1 text-left w-full"
                >
                    <div className="p-2 sm:p-3 bg-gray-700/50 rounded-lg text-green-500">
                        <PencilSquareIcon className="w-6 h-6 sm:w-8 sm:h-8"/>
                    </div>
                    <div>
                        <p className="text-sm text-gray-400">¿Listo para votar?</p>
                        <p className="text-xl sm:text-2xl font-bold text-white font-orbitron">¡A VOTAR!</p>
                        <p className="text-xs sm:text-sm text-green-500">Ir al formulario</p>
                    </div>
                </button>
            </div>

            <div className="card-bg p-4 sm:p-6 rounded-xl shadow-lg mb-8">
                <h2 className="font-orbitron text-2xl mb-4 text-white">Votos para la Próxima Carrera: <span className="motogp-red">{nextRaceInfo.race?.circuit ?? 'N/A'}</span></h2>
                {votesForNextRace.length > 0 ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                        {votesForNextRace.map(({player, vote}) => (
                            <PlayerVoteCard 
                                key={player}
                                player={player}
                                vote={vote}
                                onClick={() => setSelectedPlayer(player)}
                            />
                        ))}
                    </div>
                ) : (
                     <p className="text-gray-400 text-center py-4">{nextRaceInfo.seasonOver ? 'La temporada ha finalizado.' : 'No hay información de votos para la próxima carrera.'}</p>
                )}
            </div>

            <div className="mt-8 mb-8">
                <a 
                    href="https://docs.google.com/spreadsheets/d/1YGSNZagJv0UjxcUhCvIl1BWCJ1v9i91MYBjd1O8S3bM/edit?gid=0#gid=0"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="card-bg p-6 rounded-xl shadow-lg flex items-center space-x-4 border-t-4 border-green-500 hover:bg-gray-800/60 hover:shadow-green-900/50 transition-all duration-300 transform hover:-translate-y-1 text-left w-full"
                >
                    <div className="p-3 bg-gray-700/50 rounded-lg text-green-500">
                        <TableIcon className="w-8 h-8"/>
                    </div>
                    <div>
                        <p className="text-sm text-gray-400">Consulta los datos brutos</p>
                        <p className="text-2xl font-bold text-white font-orbitron">Acceso a la base de datos</p>
                        <p className="text-sm text-green-500">Abrir Google Sheets</p>
                    </div>
                </a>
            </div>
            
            <InstallAppCard onOpenModal={setInstallModalOS} />

            {selectedPlayer && (
                <PlayerVoteDetailsModal 
                    player={selectedPlayer}
                    data={data}
                    onClose={() => setSelectedPlayer(null)}
                />
            )}
            {installModalOS && (
                <InstallInstructionsModal os={installModalOS} onClose={() => setInstallModalOS(null)} />
            )}
        </>
    );
}


function StandingsTab({ data }: { data: MotoGpData }) {
    const tableRef = useRef<HTMLDivElement>(null);
    const [isCapturing, setIsCapturing] = useState(false);
    const [screenshot, setScreenshot] = useState<string | null>(null);

    const { currentRaceNumber, totalRaces } = useMemo(() => {
        const total = data.races.length;
        let lastRaceIndex = -1;
        for (let i = total - 1; i >= 0; i--) {
            if (data.standings.some(player => player.pointsPerRace[i] > 0)) {
                lastRaceIndex = i;
                break;
            }
        }
        return { currentRaceNumber: lastRaceIndex + 1, totalRaces: total };
    }, [data]);

    const leaderPoints = data.standings[0]?.totalPoints ?? 0;

    const getPositionClass = (index: number) => {
        switch (index) {
            case 0: return 'bg-yellow-500 hover:bg-yellow-400 text-black';
            case 1: return 'bg-gray-400 hover:bg-gray-300 text-black';
            case 2: return 'bg-yellow-700 hover:bg-yellow-600 text-white';
            default: return 'bg-gray-600 hover:bg-gray-500 text-white';
        }
    };
    
    const handleCaptureScreenshot = async () => {
        if (!tableRef.current) return;
        setIsCapturing(true);
        try {
            const canvas = await html2canvas(tableRef.current, {
                backgroundColor: '#1d1d1d', // ~ card-bg color
                scale: 2,
                useCORS: true, 
            });
            setScreenshot(canvas.toDataURL('image/png'));
        } catch (error) {
            console.error("Error capturing screenshot:", error);
        } finally {
            setIsCapturing(false);
        }
    };


    return (
        <>
            <div className="card-bg p-4 sm:p-6 rounded-xl shadow-lg">
                <div className="overflow-x-auto">
                    <div ref={tableRef} className="p-4 bg-transparent">
                        <h2 className="font-orbitron text-2xl mb-1 text-white">Clasificación General</h2>
                        <p className="text-sm text-gray-400 mb-4">
                            Tras la carrera {currentRaceNumber} de {totalRaces}
                        </p>
                        <table className="w-full text-sm text-left text-gray-300">
                            <thead className="text-xs text-red-400 uppercase bg-gray-900/50">
                                <tr>
                                    <th scope="col" className="px-2 py-3 text-center">Pos</th>
                                    <th scope="col" className="px-2 py-3">Jugador</th>
                                    <th scope="col" className="px-2 py-3 text-center">Puntos</th>
                                    <th scope="col" className="px-2 py-3 text-center" title="Diferencia con el líder">Dif. 1º</th>
                                    <th scope="col" className="px-2 py-3 text-center" title="Diferencia con el siguiente">Dif. Sig.</th>
                                    <th scope="col" className="px-2 py-3 text-center">Ult. Carr.</th>
                                </tr>
                            </thead>
                            <tbody>
                                {data.standings.map((player, index) => {
                                    const diffFromLeader = leaderPoints - player.totalPoints;
                                    const diffFromNext = index > 0 ? (data.standings[index - 1].totalPoints - player.totalPoints) : 0;
                                    const lastRacePoints = currentRaceNumber > 0 ? player.pointsPerRace[currentRaceNumber - 1] || 0 : 0;

                                    return (
                                        <tr key={player.player} className="border-b border-gray-700 hover:bg-gray-800/50">
                                            <td className="px-2 py-3 text-center">
                                                <span className={`w-8 h-8 inline-flex items-center justify-center font-bold rounded-full text-xs transition-colors ${getPositionClass(index)}`}>
                                                    {index + 1}
                                                </span>
                                            </td>
                                            <td className="px-2 py-4 font-orbitron font-bold text-white">{player.player}</td>
                                            <td className="px-2 py-4 text-center motogp-red font-orbitron">{player.totalPoints}</td>
                                            <td className="px-2 py-4 text-center text-gray-400">{index === 0 ? '-' : `-${diffFromLeader}`}</td>
                                            <td className="px-2 py-4 text-center text-gray-400">{index === 0 ? '-' : `-${diffFromNext}`}</td>
                                            <td className="px-2 py-4 text-center">{lastRacePoints}</td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </div>
                 <div className="mt-6 flex justify-end">
                    <button
                        onClick={handleCaptureScreenshot}
                        disabled={isCapturing}
                        className="bg-gray-700 hover:bg-gray-600 text-white font-bold py-2 px-4 rounded-lg transition-colors flex items-center disabled:bg-gray-500 disabled:cursor-not-allowed"
                        aria-label={isCapturing ? "Capturando..." : "Capturar y compartir clasificación"}
                    >
                        {isCapturing ? (
                            <RefreshIcon className="w-5 h-5 animate-spin mr-2" />
                        ) : (
                            <CameraIcon className="w-5 h-5 mr-2" />
                        )}
                        <span>{isCapturing ? 'Capturando...' : 'Compartir Clasificación'}</span>
                    </button>
                </div>
            </div>
             {screenshot && (
                <ScreenshotModal 
                    imageDataUrl={screenshot}
                    onClose={() => setScreenshot(null)}
                />
            )}
        </>
    );
}

function StatisticsTab({ data }: { data: MotoGpData }) {
    const [selectedPlayers, setSelectedPlayers] = useState<string[]>([]);

    const playerColors = useMemo(() => {
        const colors = new Map<string, string>();
        data.standings.forEach((player, index) => {
            colors.set(player.player, PLAYER_CHART_COLORS[index % PLAYER_CHART_COLORS.length]);
        });
        return colors;
    }, [data.standings]);

    const togglePlayer = (playerName: string) => {
        setSelectedPlayers(prev => 
            prev.includes(playerName)
                ? prev.filter(p => p !== playerName)
                : [...prev, playerName]
        );
    };

    return (
        <div className="card-bg p-4 sm:p-6 rounded-xl shadow-lg">
            <h2 className="font-orbitron text-2xl mb-4 text-white">Análisis de Evolución</h2>
            
            {/* Player Selection Buttons */}
            <div className="flex flex-wrap gap-2 mb-6 justify-center">
                {data.standings.map(player => {
                    const color = playerColors.get(player.player) || '#888';
                    const isSelected = selectedPlayers.includes(player.player);
                    return (
                        <button
                            key={player.player}
                            onClick={() => togglePlayer(player.player)}
                            className={`px-4 py-2 rounded-full text-sm font-bold transition-all duration-200 border-2 ${
                                isSelected 
                                ? 'text-white shadow-lg' 
                                : 'bg-gray-700 text-gray-300 hover:bg-gray-600 border-transparent'
                            }`}
                            style={isSelected ? { backgroundColor: color, borderColor: 'white' } : {}}
                        >
                            {player.player}
                        </button>
                    );
                })}
            </div>

            {/* Evolution Chart */}
            <EvolutionChart data={data} selectedPlayers={selectedPlayers} playerColors={playerColors} />

        </div>
    );
}

function EvolutionChart({ data, selectedPlayers, playerColors }: {
    data: MotoGpData;
    selectedPlayers: string[];
    playerColors: Map<string, string>;
}) {
    const chartContainerRef = useRef<HTMLDivElement>(null);
    const [dimensions, setDimensions] = useState({ width: 0, height: 0 });

    useEffect(() => {
        const container = chartContainerRef.current;
        if (!container) return;

        const resizeObserver = new ResizeObserver(entries => {
            if (entries[0]) {
                const { width } = entries[0].contentRect;
                // Maintain a 2:1 aspect ratio, but with a minimum height for small screens
                const height = Math.max(width / 2, 250);
                setDimensions({ width, height });
            }
        });

        resizeObserver.observe(container);
        return () => resizeObserver.disconnect();
    }, []);

    const chartData = useMemo(() => {
        const racesWithPoints = data.races.filter((_, raceIndex) => 
            data.standings.some(player => player.pointsPerRace[raceIndex] > 0)
        );

        if (racesWithPoints.length === 0) {
            return { races: [], series: [] };
        }

        const series = data.standings
            .filter(player => selectedPlayers.includes(player.player))
            .map(player => {
                let cumulativePoints = 0;
                const points = racesWithPoints.map((_, raceIndex) => {
                    const originalIndex = data.races.findIndex(r => r.circuit === racesWithPoints[raceIndex].circuit);
                    cumulativePoints += player.pointsPerRace[originalIndex] || 0;
                    return cumulativePoints;
                });
                return {
                    name: player.player,
                    data: points,
                    color: playerColors.get(player.player) || '#888'
                };
            });

        return {
            races: racesWithPoints.map(r => r.circuit.substring(0, 3).toUpperCase()),
            series: series,
        };
    }, [data, selectedPlayers, playerColors]);

    const PADDING = { top: 20, right: 20, bottom: 40, left: 40 };
    const SVG_WIDTH = dimensions.width;
    const SVG_HEIGHT = dimensions.height;
    const CHART_WIDTH = SVG_WIDTH > PADDING.left + PADDING.right ? SVG_WIDTH - PADDING.left - PADDING.right : 0;
    const CHART_HEIGHT = SVG_HEIGHT > PADDING.top + PADDING.bottom ? SVG_HEIGHT - PADDING.top - PADDING.bottom : 0;


    const maxY = useMemo(() => {
        const maxPoint = Math.max(0, ...chartData.series.flatMap(s => s.data));
        return Math.ceil(maxPoint / 50) * 50 || 50; // Round up to nearest 50
    }, [chartData]);
    
    if (chartData.races.length === 0) {
        return <div className="text-center py-10 text-gray-400">No hay datos de carreras para mostrar la evolución.</div>
    }

    const xScale = (index: number) => PADDING.left + (index / (chartData.races.length - 1)) * CHART_WIDTH;
    const yScale = (value: number) => PADDING.top + CHART_HEIGHT - (value / maxY) * CHART_HEIGHT;

    const generatePath = (points: number[]) => {
        if (chartData.races.length <= 1) { // Cannot draw a line with less than 2 points
             const point = points.length > 0 ? points[0] : 0;
             return `M ${xScale(0)} ${yScale(point)}`;
        }
        return points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${xScale(i)} ${yScale(p)}`).join(' ');
    };

    return (
        <div ref={chartContainerRef} className="w-full">
            {SVG_WIDTH > 0 && (
                <svg viewBox={`0 0 ${SVG_WIDTH} ${SVG_HEIGHT}`}>
                    {/* Y-Axis Grid Lines and Labels */}
                    {[...Array(6)].map((_, i) => {
                        const y = PADDING.top + (i * CHART_HEIGHT / 5);
                        const value = maxY - (i * maxY / 5);
                        return (
                            <g key={i}>
                                <line x1={PADDING.left} x2={PADDING.left + CHART_WIDTH} y1={y} y2={y} stroke="#4A5568" strokeDasharray="2" />
                                <text x={PADDING.left - 8} y={y + 4} fill="#A0AEC0" textAnchor="end" fontSize="10">{value}</text>
                            </g>
                        );
                    })}

                    {/* X-Axis Labels */}
                    {chartData.races.map((race, i) => (
                        <text key={race} x={xScale(i)} y={SVG_HEIGHT - PADDING.bottom + 15} fill="#A0AEC0" textAnchor="middle" fontSize="10">
                            {race}
                        </text>
                    ))}
                    
                    {/* Data Lines and Points */}
                    {chartData.series.map(series => (
                        <g key={series.name}>
                            <path d={generatePath(series.data)} fill="none" stroke={series.color} strokeWidth="2" />
                            {series.data.map((point, i) => (
                                <circle key={i} cx={xScale(i)} cy={yScale(point)} r="3" fill={series.color} />
                            ))}
                        </g>
                    ))}
                </svg>
            )}
        </div>
    );
}


function CircuitsTab({ data }: { data: MotoGpData }) {
    const [selectedCircuitIndex, setSelectedCircuitIndex] = useState(0);
    
    if (!data.races || data.races.length === 0) {
        return <div className="text-center text-gray-400">No hay datos de circuitos disponibles.</div>;
    }

    const getRaceData = (raceIndex: number) => {
        return data.standings.map(player => ({
            player: player.player,
            points: player.pointsPerRace[raceIndex] || 0,
            vote: data.playerVotes.find(v => v.player === player.player)?.votesPerRace[raceIndex] || 'N/A'
        })).sort((a,b) => b.points - a.points);
    }
    
    const raceData = getRaceData(selectedCircuitIndex);

    return (
        <div className="flex flex-col lg:grid lg:grid-cols-3 gap-6">
            <div className="lg:col-span-1 card-bg p-4 sm:p-6 rounded-xl shadow-lg">
                <h2 className="font-orbitron text-2xl mb-4 text-white">Circuitos</h2>
                {/* Mobile / Tablet buttons */}
                <div className="lg:hidden flex flex-wrap gap-2">
                    {data.races.map((race, index) => (
                        <button
                            key={race.circuit}
                            onClick={() => setSelectedCircuitIndex(index)}
                            className={`flex-grow p-2 text-xs rounded-md transition-colors ${selectedCircuitIndex === index ? 'motogp-red-bg text-white' : 'bg-gray-700/50 hover:bg-gray-700'}`}
                        >
                            {race.circuit}
                        </button>
                    ))}
                </div>
                {/* Desktop list */}
                <div className="hidden lg:flex flex-col space-y-2 max-h-[60vh] overflow-y-auto">
                    {data.races.map((race, index) => (
                         <button
                            key={race.circuit}
                            onClick={() => setSelectedCircuitIndex(index)}
                            className={`w-full text-left p-3 rounded-md transition-colors ${selectedCircuitIndex === index ? 'motogp-red-bg text-white' : 'bg-gray-700/50 hover:bg-gray-700'}`}
                         >
                            <p className="font-bold">{race.circuit}</p>
                            <p className="text-xs">{race.date}</p>
                         </button>
                    ))}
                </div>
            </div>
            <div className="lg:col-span-2 card-bg p-4 sm:p-6 rounded-xl shadow-lg">
                <h2 className="font-orbitron text-2xl mb-4 text-white">
                    Resultados de <span className="motogp-red">{data.races[selectedCircuitIndex]?.circuit ?? 'N/A'}</span>
                </h2>
                 <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left text-gray-300">
                        <thead className="text-xs text-red-400 uppercase bg-gray-900/50">
                            <tr>
                                <th className="px-6 py-3">Jugador</th>
                                <th className="px-6 py-3 text-center">Puntos</th>
                                <th className="px-6 py-3">Voto Piloto del Día</th>
                            </tr>
                        </thead>
                        <tbody>
                            {raceData.map(res => (
                                <tr key={res.player} className="border-b border-gray-700 hover:bg-gray-800/50">
                                    <td className="px-6 py-4 font-bold text-white">{res.player}</td>
                                    <td className="px-6 py-4 text-center font-orbitron">{res.points}</td>
                                    <td className="px-6 py-4">{res.vote}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}

function ParticipantesTab({ data }: { data: MotoGpData }) {
    const [selectedPlayerIndex, setSelectedPlayerIndex] = useState(0);
    const players = useMemo(() => data.standings.map(p => p.player).sort((a, b) => a.localeCompare(b)), [data.standings]);
    const selectedPlayer = players[selectedPlayerIndex];

    const voteData = useMemo(() => {
        if (!selectedPlayer || !data.allDrivers) return [];

        const playerVotesMap = new Map<string, number>();
        data.driverVoteCounts.forEach(driverCount => {
            const votes = driverCount.votesByPlayer[selectedPlayer];
            if (votes) {
                playerVotesMap.set(driverCount.driver, votes);
            }
        });

        return data.allDrivers.map(driverName => ({
            driver: driverName,
            count: playerVotesMap.get(driverName) || 0,
        }));
    }, [selectedPlayer, data.allDrivers, data.driverVoteCounts]);
    
    return (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-1 card-bg p-4 sm:p-6 rounded-xl shadow-lg">
                <h2 className="font-orbitron text-2xl mb-4 text-white">Participantes</h2>
                {/* Mobile / Tablet buttons */}
                <div className="lg:hidden flex flex-wrap gap-2">
                    {players.map((player, index) => (
                        <button
                            key={player}
                            onClick={() => setSelectedPlayerIndex(index)}
                            className={`flex-grow p-2 text-xs rounded-md transition-colors ${selectedPlayerIndex === index ? 'motogp-red-bg text-white' : 'bg-gray-700/50 hover:bg-gray-700'}`}
                        >
                            {player}
                        </button>
                    ))}
                </div>
                 {/* Desktop list */}
                <div className="hidden lg:flex flex-col space-y-2 max-h-[60vh] overflow-y-auto">
                    {players.map((player, index) => (
                         <button
                            key={player}
                            onClick={() => setSelectedPlayerIndex(index)}
                            className={`w-full text-left p-3 rounded-md transition-colors ${selectedPlayerIndex === index ? 'motogp-red-bg text-white' : 'bg-gray-700/50 hover:bg-gray-700'}`}
                         >
                            <p className="font-bold">{player}</p>
                         </button>
                    ))}
                </div>
            </div>
            <div className="lg:col-span-2 card-bg p-4 sm:p-6 rounded-xl shadow-lg">
                <h2 className="font-orbitron text-2xl mb-4 text-white">
                    Votos de <span className="motogp-red">{selectedPlayer}</span>
                </h2>
                 <VotesChart data={voteData} />
            </div>
        </div>
    );
}

function MotoGpResultsTab({ data }: { data: MotoGpData }) {
    const [selectedCircuitIndex, setSelectedCircuitIndex] = useState(0);

    const circuitResults = data.motogpResults[selectedCircuitIndex];
    
    return (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-1 card-bg p-4 sm:p-6 rounded-xl shadow-lg">
                <h2 className="font-orbitron text-2xl mb-4 text-white">Circuitos</h2>
                 {/* Mobile / Tablet buttons */}
                <div className="lg:hidden flex flex-wrap gap-2">
                    {data.races.map((race, index) => (
                        <button
                            key={race.circuit}
                            onClick={() => setSelectedCircuitIndex(index)}
                            className={`flex-grow p-2 text-xs rounded-md transition-colors ${selectedCircuitIndex === index ? 'motogp-red-bg text-white' : 'bg-gray-700/50 hover:bg-gray-700'}`}
                        >
                            {race.circuit}
                        </button>
                    ))}
                </div>
                {/* Desktop list */}
                <div className="hidden lg:flex flex-col space-y-2 max-h-[70vh] overflow-y-auto">
                    {data.races.map((race, index) => (
                         <button
                            key={race.circuit}
                            onClick={() => setSelectedCircuitIndex(index)}
                            className={`w-full text-left p-3 rounded-md transition-colors ${selectedCircuitIndex === index ? 'motogp-red-bg text-white' : 'bg-gray-700/50 hover:bg-gray-700'}`}
                         >
                            <p className="font-bold">{race.circuit}</p>
                            <p className="text-xs">{race.date}</p>
                         </button>
                    ))}
                </div>
            </div>
            <div className="lg:col-span-2 card-bg p-4 sm:p-6 rounded-xl shadow-lg flex flex-col gap-8 max-h-[80vh] overflow-y-auto">
                {circuitResults ? (
                    <>
                        <div>
                            <h2 className="font-orbitron text-2xl mb-4 text-white">
                                Resultados Sprint: <span className="motogp-red">{circuitResults.circuit}</span>
                            </h2>
                            <ResultsTable results={circuitResults.sprint} />
                        </div>
                         <div>
                            <h2 className="font-orbitron text-2xl mb-4 text-white">
                                Resultados Carrera: <span className="motogp-red">{circuitResults.circuit}</span>
                            </h2>
                            <ResultsTable results={circuitResults.race} />
                        </div>
                    </>
                ) : <p className="text-gray-400">Selecciona un circuito para ver los resultados.</p>}
            </div>
        </div>
    );
}

function VotarTab() {
    const formUrl = "https://docs.google.com/forms/d/e/1FAIpQLSehFnSvXp_Wp0zEPodbrzTdBTiX7cdwQkhJZsTEimwLMVPzdw/viewform?embedded=true";
    return (
        <div className="card-bg p-4 sm:p-6 rounded-xl shadow-lg">
            <h2 className="font-orbitron text-2xl mb-4 text-white">Formulario de Votación</h2>
            <p className="text-gray-400 mb-6">Completa el formulario para registrar tu voto para la próxima carrera. ¡Mucha suerte!</p>
            <div className="w-full h-[1200px] overflow-hidden rounded-lg">
                 <iframe
                    src={formUrl}
                    width="100%"
                    height="1200"
                    frameBorder="0"
                    marginHeight={0}
                    marginWidth={0}
                    title="Formulario de Votación de PorraGP"
                    >
                    Cargando…
                </iframe>
            </div>
        </div>
    );
}

<<<<<<< HEAD
function LiveTimingTab() {
=======
const LiveTimingTab: React.FC = () => {
>>>>>>> 5e55e5db80ef275d7cb0e2af7240d03da966d253
    const fullscreenRef = useRef<HTMLDivElement>(null);
    const wakeLockSentinelRef = useRef<any>(null);
    const [isFullscreen, setIsFullscreen] = useState(false);
    const [head, setHead] = useState<LiveTimingHead | null>(null);
    const liveTimingUrl = "https://script.google.com/macros/s/AKfycby2qhTo5C07UyquNIz8pmz4b4-7ZPn56DE_1gijH1Ze2irSWzsmXC9_f_seI9TXvekj/exec";

    const releaseWakeLock = useCallback(async () => {
        if (wakeLockSentinelRef.current) {
            try {
                await wakeLockSentinelRef.current.release();
                wakeLockSentinelRef.current = null;
            } catch(e) {
                console.error("Error releasing wake lock:", e);
            }
        }
    }, []);
    
    const handleFullscreenChange = useCallback(() => {
        const isCurrentlyFullscreen = !!document.fullscreenElement;
        setIsFullscreen(isCurrentlyFullscreen);
        if (!isCurrentlyFullscreen) {
            releaseWakeLock();
        }
    }, [releaseWakeLock]);

    const toggleFullscreen = useCallback(async () => {
        const element = fullscreenRef.current;
        if (!element) return;

        if (!document.fullscreenElement) {
            try {
                await element.requestFullscreen();
                if ('wakeLock' in navigator && (navigator as any).wakeLock) {
                    try {
                        wakeLockSentinelRef.current = await (navigator as any).wakeLock.request('screen');
                    } catch (err: any) {
                        console.error(`No se pudo adquirir el Wake Lock: ${err.message}`);
                    }
                }
            } catch (err: any) {
                console.error(`Error al activar pantalla completa: ${err.message}`);
            }
        } else {
            if (document.fullscreenElement) {
                await document.exitFullscreen();
            }
        }
    }, []);

    useEffect(() => {
        document.addEventListener('fullscreenchange', handleFullscreenChange);
        return () => {
            document.removeEventListener('fullscreenchange', handleFullscreenChange);
            releaseWakeLock();
        };
    }, [handleFullscreenChange, releaseWakeLock]);

    useEffect(() => {
        const loadHead = async () => {
            try {
                const data = await fetchLiveTiming();
                setHead(data.head);
            } catch (err) {
                console.error("Failed to load live timing head", err);
            }
        };
        loadHead();
        const interval = setInterval(loadHead, 600000); // 10 minutes
        return () => clearInterval(interval);
    }, []);

    return (
        <div ref={fullscreenRef} className="flex flex-col flex-grow bg-gray-900 data-[fullscreen=true]:p-0 data-[fullscreen=true]:h-screen data-[fullscreen=true]:w-screen data-[fullscreen=true]:rounded-none" data-fullscreen={isFullscreen}>
             <div className="flex justify-between items-center mb-4 data-[fullscreen=true]:p-4 data-[fullscreen=true]:bg-gray-900 data-[fullscreen=true]:absolute data-[fullscreen=true]:top-0 data-[fullscreen=true]:left-0 data-[fullscreen=true]:w-full data-[fullscreen=true]:z-10" data-fullscreen={isFullscreen}>
                <h2 className="font-orbitron text-2xl text-white data-[fullscreen=true]:hidden" data-fullscreen={isFullscreen}>Live Timing</h2>
                <div className="flex-grow data-[fullscreen=true]:block hidden" /> {/* Spacer */}
                <button 
                    onClick={toggleFullscreen} 
                    className="bg-gray-700 hover:bg-gray-600 text-white font-bold py-2 px-4 rounded-lg transition-colors flex items-center"
                    aria-label={isFullscreen ? "Salir de pantalla completa" : "Poner en pantalla completa"}
                >
                    {isFullscreen ? (
                        <>
                            <FullscreenExitIcon className="w-5 h-5 mr-2" />
                            Salir
                        </>
                    ) : (
                        <>
                            <FullscreenIcon className="w-5 h-5 mr-2" />
                            Pantalla Completa
                        </>
                    )}
                </button>
            </div>

            {/* Info Header from API - Hidden in fullscreen to maximize iframe space */}
            {head && (
                <div className="mb-4 bg-gray-800/50 p-4 rounded-lg border border-gray-700 flex flex-col sm:flex-row justify-between items-center gap-4 data-[fullscreen=true]:hidden" data-fullscreen={isFullscreen}>
                    <div className="flex items-center gap-3">
                        <div className={`px-3 py-1 rounded font-bold font-orbitron text-sm ${head.session_status_name === 'LIVE' ? 'bg-red-600 text-white animate-pulse' : 'bg-gray-600 text-gray-300'}`}>
                            {head.session_status_name || 'OFFLINE'}
                        </div>
                        <div className="text-center sm:text-left">
                            <h3 className="text-white font-bold text-lg">{head.circuit_name}</h3>
                            <p className="text-gray-400 text-sm">{head.category} - {head.session_name}</p>
                        </div>
                    </div>
                </div>
            )}

            <iframe
                src={liveTimingUrl}
                className="w-full flex-grow border-0 data-[fullscreen=true]:pt-16"
                data-fullscreen={isFullscreen}
                title="Live Timing Script"
                allowFullScreen
            >
                Cargando Live Timing...
            </iframe>
        </div>
    );
}

<<<<<<< HEAD
function NewsTab() {
=======
const NewsTab: React.FC = () => {
>>>>>>> 5e55e5db80ef275d7cb0e2af7240d03da966d253
    const [articles, setArticles] = useState<Article[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [currentPage, setCurrentPage] = useState(0);

    const RSS_URL = 'https://es.motorsport.com/rss/motogp/news/';
    // Usamos un proxy CORS diferente y más fiable para evitar errores de fetch.
    const PROXY_URL = 'https://corsproxy.io/?';

    useEffect(() => {
        const fetchNews = async () => {
            setIsLoading(true);
            setError(null);
            try {
                // La URL del feed debe estar codificada para que el proxy la maneje correctamente.
                const response = await fetch(`${PROXY_URL}${encodeURIComponent(RSS_URL)}`);
                if (!response.ok) {
                    throw new Error(`Error al obtener el feed de noticias (código ${response.status})`);
                }
                const text = await response.text();
                
                const parser = new DOMParser();
                const xml = parser.parseFromString(text, 'application/xml');
                const errorNode = xml.querySelector('parsererror');
                if (errorNode) {
                    throw new Error('Error al analizar el feed RSS.');
                }

                const items = Array.from(xml.querySelectorAll('item'));
                
                const parsedArticles: Article[] = items.map(item => {
                    const title = item.querySelector('title')?.textContent?.trim() || 'Sin título';
                    const link = item.querySelector('link')?.textContent || '#';
                    let description = item.querySelector('description')?.textContent?.trim() || '';
                    
                    description = description.split('<a class=\'more\'')[0].trim();
                    description = description.replace(/<br\s*\/?>/gi, ' ').replace(/Recuerda:/gi, '').replace(/&nbsp;/gi, ' ').replace(/\s+/g, ' ').trim();

                    const imageUrl = item.querySelector('enclosure')?.getAttribute('url') || '';
                    const pubDateStr = item.querySelector('pubDate')?.textContent || '';
                    const pubDate = pubDateStr ? new Date(pubDateStr).toLocaleDateString('es-ES', { year: 'numeric', month: 'long', day: 'numeric' }) : '';

                    return { title, link, description, imageUrl, pubDate };
                });
                setArticles(parsedArticles);

            } catch (err: any) {
                setError(err.message || 'Ocurrió un error al cargar las noticias.');
            } finally {
                setIsLoading(false);
            }
        };
        fetchNews();
    }, []);

    const ARTICLES_PER_PAGE = 6;
    const indexOfLastArticle = (currentPage + 1) * ARTICLES_PER_PAGE;
    const indexOfFirstArticle = indexOfLastArticle - ARTICLES_PER_PAGE;
    const currentArticles = articles.slice(indexOfFirstArticle, indexOfLastArticle);
    const totalPages = Math.ceil(articles.length / ARTICLES_PER_PAGE);


    if (isLoading) {
        return (
            <div className="text-center">
                <div className="w-12 h-12 border-4 border-dashed rounded-full animate-spin border-red-500 mx-auto"></div>
                <p className="mt-4 text-lg text-gray-300">Cargando noticias...</p>
            </div>
        );
    }

    if (error) {
        return <p className="text-center text-red-400">{error}</p>;
    }

    return (
        <div className="card-bg p-4 sm:p-6 rounded-xl shadow-lg">
            <div className="flex items-center mb-6">
                <h2 className="font-orbitron text-3xl text-white">Últimas Noticias</h2>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {currentArticles.map((article, index) => (
                    <a 
                        key={index} 
                        href={article.link} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="card-bg rounded-lg shadow-md overflow-hidden group transform hover:-translate-y-2 transition-transform duration-300 flex flex-col"
                    >
                        <div className="w-full h-48 overflow-hidden">
                             <img src={article.imageUrl} alt={article.title} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-300" />
                        </div>
                        <div className="p-4 flex flex-col flex-grow">
                            <p className="text-xs text-gray-400 mb-2">{article.pubDate}</p>
                            <h3 className="font-bold text-md text-white group-hover:motogp-red transition-colors flex-grow">{article.title}</h3>
                            <p className="text-sm text-gray-300 mt-2">{article.description}</p>
                        </div>
                    </a>
                ))}
            </div>
            
            <div className="mt-8 flex justify-center items-center gap-4">
                {currentPage > 0 && (
                    <button
                        onClick={() => setCurrentPage(prev => prev - 1)}
                        className="bg-gray-700 hover:bg-gray-600 text-white font-bold py-2 px-6 rounded-lg transition-colors"
                    >
                        Anterior
                    </button>
                )}
                 {totalPages > 1 && (
                    <span className="text-gray-400">
                        Página {currentPage + 1} de {totalPages}
                    </span>
                 )}
                {currentPage < totalPages - 1 && (
                    <button
                        onClick={() => setCurrentPage(prev => prev + 1)}
                        className="motogp-red-bg text-white font-bold py-2 px-6 rounded-lg transition-colors hover:bg-red-700"
                    >
                        Siguiente
                    </button>
                )}
            </div>

        </div>
    );
}

function ScreenshotModal({ imageDataUrl, onClose }: { imageDataUrl: string; onClose: () => void; }) {
    const [canShare, setCanShare] = useState(false);

    useEffect(() => {
        if (navigator.share) {
            setCanShare(true);
        }
    }, []);
    
    const dataUrlToBlob = async (dataUrl: string): Promise<Blob> => {
        const res = await fetch(dataUrl);
        return await res.blob();
    };

    const handleShare = async () => {
        if (!navigator.share) {
            alert("Tu navegador no soporta la función de compartir. Por favor, descarga la imagen y compártela manualmente.");
            return;
        }

        try {
            const blob = await dataUrlToBlob(imageDataUrl);
            const file = new File([blob], 'clasificacion-porragp.png', { type: 'image/png' });
            
            await navigator.share({
                title: 'Clasificación PorraGP',
                text: '¡Así va la clasificación de la PorraGP!',
                files: [file],
            });
        } catch (error) {
            console.error('Error sharing:', error);
        }
    };
    
    const handleDownload = () => {
        const link = document.createElement('a');
        link.href = imageDataUrl;
        link.download = 'clasificacion-porragp.png';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    return (
        <div className="fixed inset-0 bg-black/80 z-50 flex justify-center items-center p-4" onClick={onClose}>
            <div className="card-bg rounded-xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
                <header className="p-4 border-b border-gray-700 flex justify-between items-center flex-shrink-0">
                    <h2 className="font-orbitron text-lg text-white">Vista Previa</h2>
                    <button onClick={onClose} className="text-gray-400 hover:text-white text-2xl leading-none">&times;</button>
                </header>
                <div className="flex-1 p-4 overflow-y-auto">
                    <img src={imageDataUrl} alt="Captura de la clasificación" className="w-full h-auto rounded-md border border-gray-600" />
                </div>
                <footer className="p-4 border-t border-gray-700 flex flex-wrap justify-center sm:justify-end gap-3 flex-shrink-0">
                    <button 
                        onClick={handleDownload}
                        className="bg-blue-600 hover:bg-blue-500 text-white font-bold py-2 px-4 rounded-lg transition-colors flex items-center"
                    >
                       <DownloadIcon className="w-5 h-5 mr-2" /> Descargar
                    </button>
                    {canShare && (
                        <button 
                             onClick={handleShare}
                             className="motogp-red-bg hover:bg-red-700 text-white font-bold py-2 px-4 rounded-lg transition-colors flex items-center"
                        >
                            <ShareIcon className="w-5 h-5 mr-2" /> Compartir
                        </button>
                    )}
                </footer>
            </div>
        </div>
    );
}

function ChatBubbleButton({ onClick }: { onClick: () => void }) {
    return (
        <button
            onClick={onClick}
            className="fixed bottom-6 right-6 bg-red-600 hover:bg-red-500 text-white p-4 rounded-full shadow-lg z-40 transition-transform hover:scale-110 flex items-center justify-center"
            aria-label="Abrir Chat de Asistente"
        >
            <SparklesIcon className="w-6 h-6" />
        </button>
    );
}

function ChatWindow({ onClose, data, rawCsv }: { onClose: () => void; data: MotoGpData; rawCsv: string }) {
    const [messages, setMessages] = useState<ChatMessage[]>([
        { role: 'model', content: '¡Hola! Soy tu asistente de PorraGP. Pregúntame sobre la clasificación, estadísticas o resultados.' }
    ]);
    const [input, setInput] = useState('');
    const [isSending, setIsSending] = useState(false);
    const messagesEndRef = useRef<HTMLDivElement>(null);

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    };

    useEffect(() => {
        scrollToBottom();
    }, [messages]);

    const handleSend = async () => {
        if (!input.trim()) return;
        
        const userMessage: ChatMessage = { role: 'user', content: input };
        setMessages(prev => [...prev, userMessage]);
        setInput('');
        setIsSending(true);

        try {
            const replyText = await chatWithData(data, rawCsv, [...messages, userMessage], userMessage.content);
            setMessages(prev => [...prev, { role: 'model', content: replyText }]);
        } catch (error) {
            setMessages(prev => [...prev, { role: 'model', content: "Lo siento, hubo un error al procesar tu consulta. Verifica la configuración de la API Key." }]);
        } finally {
            setIsSending(false);
        }
    };

    return (
        <div className="fixed bottom-24 right-6 w-96 max-w-[calc(100vw-3rem)] h-[500px] max-h-[70vh] card-bg rounded-xl shadow-2xl border border-gray-700 flex flex-col z-50 overflow-hidden">
            <header className="p-4 bg-red-700 flex justify-between items-center">
                <div className="flex items-center gap-2 text-white">
                    <SparklesIcon className="w-5 h-5" />
                    <h3 className="font-bold font-orbitron">Asistente PorraGP</h3>
                </div>
                <button onClick={onClose} className="text-white/80 hover:text-white">
                    <XIcon className="w-6 h-6" />
                </button>
            </header>
            
            <div className="flex-grow p-4 overflow-y-auto space-y-4 bg-gray-900/90">
                {messages.map((msg, idx) => (
                    <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                        <div className={`max-w-[80%] p-3 rounded-lg text-sm ${
                            msg.role === 'user' 
                            ? 'bg-red-600 text-white rounded-br-none' 
                            : 'bg-gray-700 text-gray-200 rounded-bl-none'
                        }`}>
                            {msg.content}
                        </div>
                    </div>
                ))}
                {isSending && (
                    <div className="flex justify-start">
                        <div className="bg-gray-700 text-gray-400 p-3 rounded-lg rounded-bl-none text-sm animate-pulse">
                            Escribiendo...
                        </div>
                    </div>
                )}
                <div ref={messagesEndRef} />
            </div>

            <div className="p-3 bg-gray-800 border-t border-gray-700 flex gap-2">
                <input
                    type="text"
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleSend()}
                    placeholder="Pregunta algo..."
                    className="flex-grow bg-gray-700 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-500"
                />
                <button 
                    onClick={handleSend}
                    disabled={isSending || !input.trim()}
                    className="bg-red-600 hover:bg-red-500 disabled:bg-gray-600 text-white p-2 rounded-lg transition-colors"
                >
                    <SendIcon className="w-5 h-5" />
                </button>
            </div>
        </div>
    );
}

// --- INFO PRUEBA COMPONENTS ---

type InfoView = 'menu' | 'riders_list' | 'events_list' | 'rider_detail';

function InfoPruebaTab({ data }: { data: MotoGpData | null }) {
    const [currentView, setCurrentView] = useState<InfoView>('menu');
    const [selectedRiderId, setSelectedRiderId] = useState<string | null>(null);
    
    // Renderizado condicional basado en la vista actual
    const renderContent = () => {
        switch (currentView) {
            case 'menu':
                return <InfoMenu onSelectView={setCurrentView} />;
            case 'riders_list':
                return <RiderListView 
                    onSelectRider={(id) => {
                        setSelectedRiderId(id);
                        setCurrentView('rider_detail');
                    }} 
                    onBack={() => setCurrentView('menu')} 
                />;
            case 'rider_detail':
                if (!selectedRiderId) return null;
                return <RiderDetailView 
                    riderId={selectedRiderId} 
                    onBack={() => setCurrentView('riders_list')}
                    data={data}
                />;
            case 'events_list':
                return (
                    <div className="card-bg p-8 rounded-xl shadow-lg text-center animate-fade-in">
                         <button onClick={() => setCurrentView('menu')} className="bg-gray-700 hover:bg-gray-600 text-white font-bold py-2 px-4 rounded-lg transition-colors flex items-center mb-6">
                            &larr; Volver al menú
                        </button>
                        <div className="flex flex-col items-center justify-center py-12">
                            <FlagIcon className="w-16 h-16 text-gray-500 mb-4" />
                            <h3 className="text-2xl font-orbitron text-white mb-2">Próximamente</h3>
                            <p className="text-gray-400">La sección de eventos estará disponible muy pronto.</p>
                        </div>
                    </div>
                );
            default:
                return null;
        }
    };

    return (
        <div className="w-full">
            {renderContent()}
        </div>
    );
}

function InfoMenu({ onSelectView }: { onSelectView: (view: InfoView) => void }) {
    return (
        <div className="animate-fade-in">
            <h2 className="font-orbitron text-3xl text-white text-center mb-8">Datos MotoGP™</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <button 
                    onClick={() => onSelectView('riders_list')}
                    className="card-bg p-8 rounded-xl shadow-lg group hover:bg-gray-800/80 transition-all duration-300 flex flex-col items-center justify-center h-64 border border-gray-700 hover:border-red-500"
                >
                    <div className="bg-red-900/20 p-6 rounded-full mb-6 group-hover:scale-110 transition-transform duration-300">
                        <UserIcon className="w-16 h-16 text-red-500" />
                    </div>
                    <h2 className="font-orbitron text-3xl text-white group-hover:text-red-500 transition-colors">Pilotos</h2>
                    <p className="text-gray-400 mt-2 text-center">Consulta la parrilla, fichas y estadísticas de los pilotos.</p>
                </button>

                <button 
                    onClick={() => onSelectView('events_list')}
                    className="card-bg p-8 rounded-xl shadow-lg group hover:bg-gray-800/80 transition-all duration-300 flex flex-col items-center justify-center h-64 border border-gray-700 hover:border-red-500"
                >
                    <div className="bg-red-900/20 p-6 rounded-full mb-6 group-hover:scale-110 transition-transform duration-300">
                        <FlagIcon className="w-16 h-16 text-red-500" />
                    </div>
                    <h2 className="font-orbitron text-3xl text-white group-hover:text-red-500 transition-colors">Eventos</h2>
                    <p className="text-gray-400 mt-2 text-center">Calendario, circuitos y detalles de cada Gran Premio.</p>
                </button>
            </div>
        </div>
    );
}

function RiderListView({ onSelectRider, onBack }: { onSelectRider: (id: string) => void, onBack: () => void }) {
    const [riders, setRiders] = useState<ApiRider[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [selectedSeasonYear, setSelectedSeasonYear] = useState<number>(2026);
    const [selectedCategory, setSelectedCategory] = useState<string>('MotoGP');

    useEffect(() => {
        const loadRidersForSeason = async () => {
            try {
                setError(null);
                setIsLoading(true);
                const fetchedRiders = await fetchRidersBySeason(selectedSeasonYear, selectedCategory);
                // Ordenar por número (ascendente). Si no hay número, poner al final (999).
                setRiders(fetchedRiders.sort((a, b) => {
                    const numA = a.current_career_step?.number || 999;
                    const numB = b.current_career_step?.number || 999;
                    return numA - numB;
                }));
            } catch (err: any) {
                setError(err.message || `No se pudieron cargar los datos para la temporada ${selectedSeasonYear}.`);
            } finally {
                setIsLoading(false);
            }
        };
        loadRidersForSeason();
    }, [selectedSeasonYear, selectedCategory]);

    return (
        <div className="card-bg p-4 sm:p-6 rounded-xl shadow-lg animate-fade-in">
            <div className="flex flex-col space-y-6 mb-6">
                <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-4">
                    <div className="flex items-center gap-4">
                        <button onClick={onBack} className="text-gray-400 hover:text-white transition-colors">
                            &larr; Volver
                        </button>
                        <h2 className="font-orbitron text-2xl text-white">Parrilla</h2>
                    </div>
                    <select
                        value={selectedSeasonYear}
                        onChange={(e) => {
                            setIsLoading(true);
                            setSelectedSeasonYear(Number(e.target.value));
                        }}
                        className="bg-gray-700 text-white text-sm font-bold px-3 py-2 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 appearance-none cursor-pointer"
                        aria-label="Seleccionar temporada"
                    >
                        <option value="2026">Temporada 2026</option>
                        <option value="2025">Temporada 2025</option>
                    </select>
                </div>

                <div className="flex flex-wrap justify-center gap-2">
                    {['MotoGP', 'Moto2', 'Moto3'].map((cat) => (
                        <button
                            key={cat}
                            onClick={() => setSelectedCategory(cat)}
                            className={`px-4 py-2 rounded-full font-bold text-sm transition-colors ${
                                selectedCategory === cat 
                                ? 'motogp-red-bg text-white' 
                                : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                            }`}
                        >
                            {cat}
                        </button>
                    ))}
                </div>
            </div>

            {isLoading && (
                <div className="text-center py-8">
                    <div className="w-12 h-12 border-4 border-dashed rounded-full animate-spin border-red-500 mx-auto"></div>
                    <p className="mt-4 text-gray-300">Cargando parrilla de {selectedCategory} {selectedSeasonYear}...</p>
                </div>
            )}

            {error && <p className="text-center text-red-400 py-8">{error}</p>}
            
            {!isLoading && !error && (
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                    {riders.map(rider => (
                        <RiderCard key={rider.id} rider={rider} onSelect={() => onSelectRider(rider.id)} />
                    ))}
                </div>
            )}
        </div>
    );
}

interface RiderCardProps {
    rider: ApiRider;
    onSelect: () => void;
}

const RiderCard: React.FC<RiderCardProps> = ({ rider, onSelect }) => {
    const profilePic = rider.current_career_step?.pictures?.profile?.main;
    return (
        <button onClick={onSelect} className="card-bg rounded-lg shadow-md overflow-hidden group transform hover:-translate-y-1 transition-transform duration-300 text-left w-full border border-gray-800 hover:border-red-500/50">
            <div className="relative h-48 bg-gray-800">
                {profilePic ? (
                    <img src={profilePic} alt={`${rider.name} ${rider.surname}`} className="w-full h-full object-cover object-top" />
                ) : (
                    <div className="w-full h-full flex items-center justify-center">
                        <UserIcon className="w-16 h-16 text-gray-600" />
                    </div>
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-transparent to-transparent"></div>
                <div className="absolute bottom-0 left-0 p-3 w-full">
                    <div className="flex items-center justify-between w-full">
                        <div className="flex items-center gap-2 overflow-hidden">
                            <img src={rider.country.flag} alt={rider.country.name} className="w-6 h-4 object-cover rounded-sm flex-shrink-0" />
                            <h3 className="font-bold text-white group-hover:motogp-red transition-colors truncate text-sm md:text-base">
                                {rider.name} {rider.surname}
                            </h3>
                        </div>
                    </div>
                </div>
                 <div className="absolute top-2 right-2 bg-black/50 backdrop-blur-sm text-white font-orbitron text-xl font-bold px-2 py-1 rounded-md border border-white/10">
                    {rider.current_career_step?.number}
                </div>
            </div>
        </button>
    );
}

function RiderDetailView({ riderId, onBack, data }: { riderId: string; onBack: () => void; data: MotoGpData | null }) {
    const [rider, setRider] = useState<ApiRider | null>(null);
    const [stats, setStats] = useState<RiderStats | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [showFullStatsModal, setShowFullStatsModal] = useState(false);
    const [showSeasonStatsModal, setShowSeasonStatsModal] = useState(false);

    useEffect(() => {
        const loadRiderData = async () => {
            try {
                setIsLoading(true);
                setError(null);
                
                // 1. Cargar detalles básicos
                const details = await fetchRiderDetails(riderId);
                setRider(details);

                // 2. Cargar estadísticas si tenemos el legacy_id
                if (details.legacy_id) {
                    try {
                        const statistics = await fetchRiderStats(details.legacy_id);
                        setStats(statistics);
                    } catch (statsErr) {
                        console.warn("No se pudieron cargar las estadísticas extendidas", statsErr);
                    }
                }
            } catch (err: any) {
                setError(err.message || 'No se pudo cargar la ficha del piloto.');
            } finally {
                setIsLoading(false);
            }
        };
        loadRiderData();
    }, [riderId]);

    if (isLoading) {
        return (
             <div className="text-center py-12">
                <div className="w-16 h-16 border-4 border-dashed rounded-full animate-spin border-red-500 mx-auto"></div>
                <p className="mt-4 text-gray-300 font-orbitron">Cargando datos del piloto...</p>
            </div>
        );
    }
    
    if (error) return <p className="text-center text-red-400 py-8">{error}</p>;
    if (!rider) return <p className="text-center text-gray-400 py-8">No se encontró la información del piloto.</p>;

    const { name, surname, birth_date, birth_city, country, physical_attributes, career } = rider;
    const current_career_step = career?.find(c => c.current);
    
    // Calcular edad dinámicamente
    const calculateAge = (birthDateString: string): number => {
        if (!birthDateString) return 0;
        const birthDate = new Date(birthDateString);
        const today = new Date();
        let age = today.getFullYear() - birthDate.getFullYear();
        const m = today.getMonth() - birthDate.getMonth();
        if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) {
            age--;
        }
        return age;
    };
    const dynamicAge = calculateAge(birth_date);


    if (!current_career_step) {
        return (
             <div className="card-bg p-4 sm:p-6 rounded-xl shadow-lg animate-fade-in">
                 <button onClick={onBack} className="bg-gray-700 hover:bg-gray-600 text-white font-bold py-2 px-4 rounded-lg transition-colors flex items-center mb-6">
                    &larr; Volver a la lista
                </button>
                <p className="text-center text-yellow-400 py-8">No se encontró información de la temporada actual para este piloto ({name} {surname}).</p>
             </div>
        );
    }

    const { team, pictures } = current_career_step;

    return (
        <div className="card-bg p-4 sm:p-6 rounded-xl shadow-lg animate-fade-in">
            <button onClick={onBack} className="bg-gray-700 hover:bg-gray-600 text-white font-bold py-2 px-4 rounded-lg transition-colors flex items-center mb-6">
                &larr; Volver a la lista
            </button>
            
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Columna Izquierda: Imágenes */}
                <div className="lg:col-span-1 space-y-6">
                     <div className="relative rounded-lg overflow-hidden shadow-2xl border border-gray-700">
                        {pictures.profile.main ? (
                            <img src={pictures.profile.main} alt={`${name} ${surname}`} className="w-full object-cover" />
                        ) : (
                            <div className="w-full h-64 bg-gray-800 flex items-center justify-center">
                                <UserIcon className="w-20 h-20 text-gray-600"/>
                            </div>
                        )}
                         <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/90 to-transparent p-4">
                             <h2 className="font-orbitron text-2xl text-white text-center">{name} {surname}</h2>
                         </div>
                     </div>
                     
                     <div className="grid grid-cols-2 gap-4">
                        {pictures.bike.main && (
                            <div className="rounded-lg overflow-hidden border border-gray-700 bg-gray-800 p-2">
                                <img src={pictures.bike.main} alt="Moto" className="w-full h-auto" />
                                <p className="text-xs text-center text-gray-400 mt-1">Moto</p>
                            </div>
                        )}
                        {pictures.helmet.main && (
                            <div className="rounded-lg overflow-hidden border border-gray-700 bg-gray-800 p-2">
                                <img src={pictures.helmet.main} alt="Casco" className="w-full h-auto" />
                                <p className="text-xs text-center text-gray-400 mt-1">Casco</p>
                            </div>
                        )}
                     </div>
                </div>

                {/* Columna Derecha: Datos y Estadísticas */}
                <div className="lg:col-span-2">
                    <div className="flex items-start justify-between mb-6 border-b border-gray-700 pb-4">
                        <div className="flex items-center gap-4">
                            <img src={country.flag} alt={country.name} className="w-16 h-10 object-cover rounded-md shadow-md border border-gray-600"/>
                            <div>
                                <h1 className="font-orbitron text-4xl sm:text-5xl text-white uppercase tracking-wider">{name} <span className="text-red-600">{surname}</span></h1>
                                <p className="text-gray-400 text-lg">{team.name}</p>
                            </div>
                        </div>
                        <div className="text-right hidden sm:block">
                             <span className="font-orbitron text-6xl text-white/10 font-bold select-none">#{current_career_step.number}</span>
                        </div>
                    </div>

                    {/* Estadísticas Clave con Desglose */}
                    {stats && (
                        <>
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
                                <StatBoxWithBreakdown label="Victorias" total={stats.grand_prix_victories?.total} categories={stats.grand_prix_victories?.categories} />
                                <StatBoxWithBreakdown label="Podios" total={stats.podiums?.total} categories={stats.podiums?.categories} />
                                <StatBoxWithBreakdown label="Poles" total={stats.poles?.total} categories={stats.poles?.categories} />
                                <StatBoxWithBreakdown label="Títulos" total={stats.world_championship_wins?.total} categories={stats.world_championship_wins?.categories} isGold />
                            </div>
                            <div className="flex flex-wrap gap-4 mb-8">
                                <button 
                                    onClick={() => setShowFullStatsModal(true)}
                                    className="bg-gray-800 hover:bg-gray-700 text-white font-bold py-3 px-6 rounded-lg transition-colors border border-gray-600 flex-1 text-center"
                                >
                                    Más estadísticas
                                </button>
                                <button 
                                    onClick={() => setShowSeasonStatsModal(true)}
                                    className="motogp-red-bg hover:bg-red-700 text-white font-bold py-3 px-6 rounded-lg transition-colors flex-1 text-center"
                                >
                                    Histórico posición
                                </button>
                            </div>
                        </>
                    )}
                    
                    {data && (
                        <div className="mb-8">
                            <h3 className="font-orbitron text-lg text-white mb-4 uppercase">Temporada Actual</h3>
                            <div className="bg-gray-900/50 p-4 rounded-xl border border-gray-800 h-64">
                                <CurrentSeasonChart results={data.motogpResults} riderSurname={surname} riderName={name} />
                            </div>
                        </div>
                    )}

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <InfoBlock title="Datos Personales">
                            <InfoItem label="Nacionalidad" value={country.name} />
                            <InfoItem label="Ciudad Natal" value={birth_city} />
                            <InfoItem label="Fecha de Nacimiento" value={new Date(birth_date).toLocaleDateString('es-ES')} />
                            <InfoItem label="Edad" value={`${dynamicAge} años`} />
                            {physical_attributes && (
                                <>
                                    <InfoItem label="Altura" value={`${physical_attributes.height} cm`} />
                                    <InfoItem label="Peso" value={`${physical_attributes.weight} kg`} />
                                </>
                            )}
                        </InfoBlock>

                        <InfoBlock title="Equipo & Máquina">
                            <InfoItem label="Dorsal" value={`#${current_career_step.number}`} />
                            <InfoItem label="Equipo" value={team.name} />
                            <InfoItem label="Constructor" value={team.constructor.name} />
                            <InfoItem label="Categoría" value={current_career_step.category.name} />
                             {team.picture && (
                                 <div className="mt-4 bg-white/5 p-2 rounded-lg">
                                     <img src={team.picture} alt={team.name} className="w-full h-auto" />
                                 </div>
                             )}
                        </InfoBlock>
                    </div>
                </div>
            </div>
            
            {/* Modals */}
            {showFullStatsModal && stats && (
                <FullStatsModal stats={stats} onClose={() => setShowFullStatsModal(false)} />
            )}
            {showSeasonStatsModal && rider.legacy_id && (
                <SeasonStatsModal legacyId={rider.legacy_id} onClose={() => setShowSeasonStatsModal(false)} />
            )}
        </div>
    );
}

function CurrentSeasonChart({ results, riderSurname, riderName }: { results: CircuitResult[], riderSurname: string, riderName: string }) {
    const containerRef = useRef<HTMLDivElement>(null);
    const [dimensions, setDimensions] = useState({ width: 0, height: 0 });

    useEffect(() => {
        const container = containerRef.current;
        if (!container) return;
        const resizeObserver = new ResizeObserver(entries => {
            if (entries[0]) {
                const { width, height } = entries[0].contentRect;
                setDimensions({ width, height });
            }
        });
        resizeObserver.observe(container);
        return () => resizeObserver.disconnect();
    }, []);

    const chartData = useMemo(() => {
        if (!results || results.length === 0) return [];
        
        return results.map(circuitResult => {
            const circuitCode = circuitResult.circuit.substring(0, 3).toUpperCase();
            
            const isMatch = (driverNameInCsv: string) => {
                const d = driverNameInCsv.toLowerCase();
                const s = riderSurname.toLowerCase();
                const n = riderName.toLowerCase();
                
                // Manejo específico para colisiones de apellidos comunes
                if (s === 'marquez') {
                    if (n === 'marc') return d.includes('m. marquez') || d.includes('m.marquez');
                    if (n === 'alex') return d.includes('a. marquez') || d.includes('a.marquez');
                }
                if (s === 'fernandez') {
                     if (n === 'raul') return d.includes('r. fernandez') || d.includes('r.fernandez');
                     if (n === 'augusto') return d.includes('a. fernandez') || d.includes('a.fernandez');
                }
                
                // Fallback por defecto: si contiene el apellido
                return d.includes(s);
            }

            // Buscar resultados del piloto usando la función de coincidencia inteligente
            const sprintResult = circuitResult.sprint.find(r => isMatch(r.driver));
            const raceResult = circuitResult.race.find(r => isMatch(r.driver));
            
            return {
                circuit: circuitCode,
                sprintPoints: sprintResult ? sprintResult.points : 0,
                racePoints: raceResult ? raceResult.points : 0
            };
        });
    }, [results, riderSurname, riderName]);

    if (chartData.length === 0) return <div className="w-full h-full flex items-center justify-center text-gray-500">Sin datos de temporada</div>;

    const PADDING = { top: 20, right: 20, bottom: 30, left: 30 };
    const WIDTH = dimensions.width;
    const HEIGHT = dimensions.height;
    const CHART_WIDTH = WIDTH - PADDING.left - PADDING.right;
    const CHART_HEIGHT = HEIGHT - PADDING.top - PADDING.bottom;
    const MAX_POINTS = 25;

    const xScale = (index: number) => PADDING.left + (index / (chartData.length - 1 || 1)) * CHART_WIDTH;
    const yScale = (points: number) => PADDING.top + CHART_HEIGHT - (points / MAX_POINTS) * CHART_HEIGHT;

    const sprintPath = chartData.map((d, i) => `${i === 0 ? 'M' : 'L'} ${xScale(i)} ${yScale(d.sprintPoints)}`).join(' ');
    const racePath = chartData.map((d, i) => `${i === 0 ? 'M' : 'L'} ${xScale(i)} ${yScale(d.racePoints)}`).join(' ');

    return (
        <div ref={containerRef} className="w-full h-full">
            {WIDTH > 0 && (
                <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} className="w-full h-full overflow-visible">
                    {/* Eje Y Grid */}
                    {[0, 5, 10, 15, 20, 25].map(val => {
                        const y = yScale(val);
                        return (
                            <g key={val}>
                                <line x1={PADDING.left} x2={WIDTH - PADDING.right} y1={y} y2={y} stroke="#374151" strokeDasharray="2" />
                                <text x={PADDING.left - 5} y={y + 3} fill="#9CA3AF" fontSize="10" textAnchor="end">{val}</text>
                            </g>
                        );
                    })}

                    {/* Eje X Labels (Circuitos) */}
                    {chartData.map((d, i) => (
                        <text 
                            key={i} 
                            x={xScale(i)} 
                            y={HEIGHT - 5} 
                            fill="#9CA3AF" 
                            fontSize="10" 
                            textAnchor="end" 
                            transform={`rotate(-45, ${xScale(i)}, ${HEIGHT - 5})`}
                        >
                            {d.circuit}
                        </text>
                    ))}

                    {/* Líneas */}
                    <path d={sprintPath} fill="none" stroke="#22c55e" strokeWidth="2" />
                    <path d={racePath} fill="none" stroke="#ef4444" strokeWidth="2" />

                    {/* Puntos */}
                    {chartData.map((d, i) => (
                        <g key={i}>
                            <circle cx={xScale(i)} cy={yScale(d.sprintPoints)} r="3" fill="#22c55e" />
                            <circle cx={xScale(i)} cy={yScale(d.racePoints)} r="3" fill="#ef4444" />
                        </g>
                    ))}
                    
                    {/* Leyenda */}
                    <g transform={`translate(${WIDTH - 80}, 0)`}>
                        <rect width="10" height="10" fill="#ef4444" rx="2" />
                        <text x="15" y="9" fill="#ef4444" fontSize="10" fontWeight="bold">RACE</text>
                        <rect y="15" width="10" height="10" fill="#22c55e" rx="2" />
                        <text x="15" y="24" fill="#22c55e" fontSize="10" fontWeight="bold">SPR</text>
                    </g>
                </svg>
            )}
        </div>
    );
}

function StatBoxWithBreakdown({ label, total, categories, isGold }: { label: string; total: number | undefined; categories: any[] | undefined; isGold?: boolean }) {
    const safeTotal = total ?? 0;
    
    const breakdownText = useMemo(() => {
        if (!categories || categories.length === 0) return null;

        // Función auxiliar para determinar el orden
        const getCategoryOrder = (name: string) => {
            if (name.includes('125')) return 1;
            if (name.includes('Moto3')) return 2;
            if (name.includes('250')) return 3;
            if (name.includes('Moto2')) return 4;
            if (name.includes('500')) return 5;
            if (name.includes('MotoGP')) return 6;
            return 7; 
        };

        // Ordenar las categorías: 125cc -> Moto3 -> 250cc -> Moto2 -> 500cc -> MotoGP
        const sortedCategories = [...categories].sort((a, b) => {
             return getCategoryOrder(a.category.name) - getCategoryOrder(b.category.name);
        });

        // Mapear nombres largos a códigos cortos
        return sortedCategories.map((cat: any) => {
            const name = cat.category.name || '';
            let shortCode = '';
            if (name.includes('MotoGP')) shortCode = 'MGP';
            else if (name.includes('Moto2')) shortCode = 'M2';
            else if (name.includes('Moto3')) shortCode = 'M3';
            else if (name.includes('125')) shortCode = '125';
            else if (name.includes('250')) shortCode = '250';
            else if (name.includes('500')) shortCode = '500';
            else shortCode = name.substring(0, 3).toUpperCase();
            
            return `${shortCode}-${cat.count}`;
        }).join(' ');
    }, [categories]);

    return (
        <div className={`p-4 rounded-lg text-center border flex flex-col justify-center items-center ${isGold ? 'bg-yellow-900/20 border-yellow-600/50' : 'bg-gray-800 border-gray-700'}`}>
            <p className={`text-3xl font-orbitron font-bold ${isGold ? 'text-yellow-500' : 'text-white'}`}>{safeTotal}</p>
            <p className="text-xs text-gray-400 uppercase tracking-wider mt-1">{label}</p>
            {breakdownText && (
                <p className="text-[10px] text-gray-500 mt-2 font-mono">{breakdownText}</p>
            )}
        </div>
    );
}

function FullStatsModal({ stats, onClose }: { stats: RiderStats; onClose: () => void }) {
    return (
        <div className="fixed inset-0 bg-black/80 z-50 flex justify-center items-center p-4" onClick={onClose}>
            <div className="card-bg rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
                <header className="p-4 border-b border-gray-700 flex justify-between items-center">
                    <h2 className="font-orbitron text-xl text-white">Estadísticas Completas</h2>
                    <button onClick={onClose} className="text-gray-400 hover:text-white text-2xl leading-none">&times;</button>
                </header>
                <div className="p-6 overflow-y-auto space-y-6">
                    <div className="grid grid-cols-2 gap-4">
                         <StatBoxWithBreakdown label="Carreras" total={stats.all_races?.total} categories={stats.all_races?.categories} />
                         <StatBoxWithBreakdown label="Vueltas Rápidas" total={stats.race_fastest_laps?.total} categories={stats.race_fastest_laps?.categories} />
                    </div>
                    
                    <div className="space-y-4">
                        <DetailStatRow title="Primer Gran Premio" items={stats.first_grand_prix} />
                        <DetailStatRow title="Primera Victoria" items={stats.first_grand_prix_victories} />
                        <DetailStatRow title="Primer Podio" items={stats.first_podiums} />
                        <DetailStatRow title="Primera Pole" items={stats.first_pole_positions} />
                    </div>
                </div>
            </div>
        </div>
    );
}

function DetailStatRow({ title, items }: { title: string; items: any[] | undefined }) {
    if (!items || items.length === 0) return null;
    return (
        <div className="bg-gray-800/50 p-3 rounded border border-gray-700">
            <h4 className="text-gray-400 text-xs uppercase mb-2">{title}</h4>
            {items.map((item, idx) => (
                <div key={idx} className="text-sm text-white mb-1 last:mb-0">
                    <span className="font-bold text-red-400">{item.category.name}:</span> {item.event.season} {item.event.name}
                </div>
            ))}
        </div>
    );
}

function SeasonStatsModal({ legacyId, onClose }: { legacyId: number; onClose: () => void }) {
    const [seasonStats, setSeasonStats] = useState<RiderSeasonStat[]>([]);
    const [isLoading, setIsLoading] = useState(true);

<<<<<<< HEAD
    useEffect(() => {
        const load = async () => {
            try {
                const data = await fetchRiderSeasonStats(legacyId);
                setSeasonStats(data);
            } catch (e) {
                console.error(e);
            } finally {
                setIsLoading(false);
            }
        };
        load();
    }, [legacyId]);

    return (
        <div className="fixed inset-0 bg-black/80 z-50 flex justify-center items-center p-4" onClick={onClose}>
            <div className="card-bg rounded-xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
                <header className="p-4 border-b border-gray-700 flex justify-between items-center">
                    <h2 className="font-orbitron text-xl text-white">Historial por Temporada</h2>
                    <button onClick={onClose} className="text-gray-400 hover:text-white text-2xl leading-none">&times;</button>
                </header>
                <div className="p-4 overflow-auto">
                    {isLoading ? (
                        <div className="text-center py-8 text-gray-400">Cargando historial...</div>
                    ) : (
                        <table className="w-full text-xs sm:text-sm text-left text-gray-300">
                            <thead className="text-xs text-red-400 uppercase bg-gray-900/50 sticky top-0">
                                <tr>
                                    <th className="px-2 py-3">Año</th>
                                    <th className="px-2 py-3">Cat</th>
                                    <th className="px-2 py-3">Moto</th>
                                    <th className="px-2 py-3 text-center">Pos</th>
                                    <th className="px-2 py-3 text-center">Pts</th>
                                    <th className="px-2 py-3 text-center hidden sm:table-cell">Vic</th>
                                    <th className="px-2 py-3 text-center hidden sm:table-cell">Pod</th>
                                </tr>
                            </thead>
                            <tbody>
                                {seasonStats.map((stat, idx) => (
                                    <tr key={idx} className="border-b border-gray-700 hover:bg-gray-800/50">
                                        <td className="px-2 py-3 font-bold text-white">{stat.season}</td>
                                        <td className="px-2 py-3">{stat.category}</td>
                                        <td className="px-2 py-3">{stat.constructor}</td>
                                        <td className="px-2 py-3 text-center font-bold text-white">{stat.position || '-'}</td>
                                        <td className="px-2 py-3 text-center">{stat.points}</td>
                                        <td className="px-2 py-3 text-center hidden sm:table-cell">{stat.first_position}</td>
                                        <td className="px-2 py-3 text-center hidden sm:table-cell">{stat.podiums}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                </div>
            </div>
        </div>
    );
}

interface InfoBlockProps {
    title: string;
    children?: React.ReactNode;
}

const InfoBlock: React.FC<InfoBlockProps> = ({ title, children }) => {
    return (
        <div className="bg-gray-900/50 p-5 rounded-xl border border-gray-800">
            <h3 className="font-orbitron text-lg text-red-500 mb-4 border-b border-gray-800 pb-2 uppercase">{title}</h3>
            <div className="space-y-3">{children}</div>
        </div>
    );
}

function InfoItem({ label, value }: { label: string, value: string | number }) {
    return (
        <div className="flex justify-between text-sm items-center">
            <span className="text-gray-500 font-medium">{label}</span>
            <span className="font-bold text-gray-200 text-right">{value}</span>
        </div>
    );
}

function StatCard({ title, value, metric, icon }: { title: string, value: string, metric: string, icon: React.ReactNode }) {
    return (
        <div className="card-bg p-4 sm:p-6 rounded-xl shadow-lg flex items-center space-x-4 border-t-4 border-red-600 hover:bg-gray-800/60 transition-colors duration-300">
            <div className="p-3 bg-gray-700/50 rounded-lg text-red-500">
                {icon}
            </div>
            <div>
                <p className="text-sm text-gray-400">{title}</p>
                <p className="text-lg sm:text-2xl font-bold text-white font-orbitron truncate">{value}</p>
                <p className="text-xs sm:text-sm text-green-500">{metric}</p>
            </div>
        </div>
    );
}

interface PlayerVoteCardProps {
    player: string;
    vote: string;
    onClick: () => void;
}

const PlayerVoteCard: React.FC<PlayerVoteCardProps> = ({ player, vote, onClick }) => {
    const riderColor = getRiderColor(vote);
    return (
        <div 
            onClick={onClick}
            className="bg-gray-900/50 p-4 rounded-lg border border-gray-700 flex items-center justify-between hover:bg-gray-800 cursor-pointer transition-colors group"
        >
            <div className="flex items-center gap-3">
                <div className="w-2 h-10 rounded-full" style={{ backgroundColor: riderColor }}></div>
                <div>
                    <p className="font-bold text-white group-hover:text-red-400 transition-colors">{player}</p>
                    <p className="text-sm text-gray-400">Voto: <span className="text-white font-medium">{vote}</span></p>
                </div>
            </div>
        </div>
    );
}

function PlayerVoteDetailsModal({ player, data, onClose }: { player: string; data: MotoGpData; onClose: () => void }) {
    const playerVotes = data.playerVotes.find(p => p.player === player);
    const score = data.standings.find(p => p.player === player);

    if (!playerVotes || !score) return null;

    const voteCounts: Record<string, number> = {};
    playerVotes.votesPerRace.forEach(vote => {
        if (vote && vote !== '-') {
            voteCounts[vote] = (voteCounts[vote] || 0) + 1;
        }
    });

    const sortedVotes = Object.entries(voteCounts).sort((a, b) => b[1] - a[1]);

    return (
        <div className="fixed inset-0 bg-black/80 z-50 flex justify-center items-center p-4" onClick={onClose}>
            <div className="card-bg rounded-xl shadow-2xl w-full max-w-md max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
                <header className="p-4 border-b border-gray-700 flex justify-between items-center">
                    <h2 className="font-orbitron text-xl text-white">{player}</h2>
                    <button onClick={onClose} className="text-gray-400 hover:text-white text-2xl leading-none">&times;</button>
                </header>
                <div className="p-6 overflow-y-auto">
                    <div className="grid grid-cols-2 gap-4 mb-6">
                        <div className="bg-gray-800 p-3 rounded-lg text-center">
                            <p className="text-gray-400 text-xs uppercase">Puntos Totales</p>
                            <p className="text-2xl font-bold text-white font-orbitron">{score.totalPoints}</p>
                        </div>
                        <div className="bg-gray-800 p-3 rounded-lg text-center">
                            <p className="text-gray-400 text-xs uppercase">Pilotos Votados</p>
                            <p className="text-2xl font-bold text-white font-orbitron">{Object.keys(voteCounts).length}</p>
                        </div>
                    </div>

                    <h3 className="text-lg font-bold text-white mb-3">Historial de Votos</h3>
                    <div className="space-y-2">
                        {sortedVotes.map(([driver, count]) => (
                            <div key={driver} className="flex items-center justify-between bg-gray-800/50 p-2 rounded border border-gray-700">
                                <div className="flex items-center gap-3">
                                    <div className="w-1 h-8 rounded" style={{ backgroundColor: getRiderColor(driver) }}></div>
                                    <span className="text-white font-medium">{driver}</span>
                                </div>
                                <span className="text-gray-400 font-bold">{count}x</span>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
}

function VotesChart({ data }: { data: { driver: string; count: number }[] }) {
    const maxVotes = Math.max(...data.map(d => d.count), 1);
    const activeData = data.filter(d => d.count > 0).sort((a, b) => b.count - a.count);

    if (activeData.length === 0) {
        return <p className="text-gray-400 text-center py-8">Este jugador aún no ha votado.</p>;
    }

    return (
        <div className="space-y-3">
            {activeData.map(item => (
                <div key={item.driver} className="relative">
                    <div className="flex justify-between text-sm mb-1">
                        <span className="text-white font-bold">{item.driver}</span>
                        <span className="text-gray-400">{item.count} votos</span>
                    </div>
                    <div className="w-full bg-gray-700 rounded-full h-2.5">
                        <div 
                            className="h-2.5 rounded-full transition-all duration-500"
                            style={{ 
                                width: `${(item.count / maxVotes) * 100}%`,
                                backgroundColor: getRiderColor(item.driver)
                            }}
                        ></div>
                    </div>
                </div>
            ))}
        </div>
    );
}

function ResultsTable({ results }: { results: RaceResult[] }) {
    if (!results || results.length === 0) {
        return <p className="text-gray-500 text-sm italic">Resultados no disponibles.</p>;
    }
    return (
        <div className="overflow-x-auto">
            <table className="w-full text-sm text-left text-gray-300">
                <thead className="text-xs text-gray-400 uppercase bg-gray-800/50">
                    <tr>
                        <th className="px-4 py-2 text-center w-12">Pos</th>
                        <th className="px-4 py-2">Piloto</th>
                        <th className="px-4 py-2 text-center">Pts</th>
                    </tr>
                </thead>
                <tbody>
                    {results.map((res) => (
                        <tr key={res.position} className="border-b border-gray-700">
                            <td className="px-4 py-3 text-center">
                                <span className={`inline-block w-6 h-6 rounded-full text-center leading-6 text-xs font-bold 
                                    ${res.position === 1 ? 'bg-yellow-500 text-black' : 
                                      res.position === 2 ? 'bg-gray-400 text-black' : 
                                      res.position === 3 ? 'bg-yellow-700 text-white' : 'bg-gray-700 text-white'}`}>
                                    {res.position}
                                </span>
                            </td>
                            <td className="px-4 py-3 font-medium text-white">{res.driver}</td>
                            <td className="px-4 py-3 text-center">{res.points}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}

=======
>>>>>>> 5e55e5db80ef275d7cb0e2af7240d03da966d253
export default App;

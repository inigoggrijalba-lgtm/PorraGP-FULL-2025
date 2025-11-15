
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { chatWithData } from './services/geminiService';
import type { MotoGpData, Race, PlayerScore, PlayerVote, DriverVoteCount, ChatMessage, RaceResult, CircuitResult, Article } from './types';
import { TrophyIcon, TableIcon, SparklesIcon, SendIcon, RefreshIcon, FlagIcon, UserIcon, PencilSquareIcon, ClockIcon, MenuIcon, XIcon, NewspaperIcon } from './components/icons';

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


const parseMotoGpData = (csvText: string): MotoGpData => {
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
        standings.push({
            player: row[0].trim(),
            totalPoints: parseFloat(row[1]) || 0,
            pointsPerRace: row.slice(2, 24).map(p => parseFloat(p) || 0),
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
    for (let j = 2; j < 24; j++) { // Iterar por columnas de circuitos
        const circuitName = dataGrid[2][j]?.trim();
        if (!circuitName) continue;

        const sprintResults: RaceResult[] = [];
        for (let i = 49; i <= 57; i++) { // Filas de Sprint (50-58 en CSV)
            const driver = dataGrid[i]?.[j]?.trim();
            if (driver) {
                sprintResults.push({
                    position: i - 48,
                    driver: driver,
                    points: parseInt(dataGrid[i][0]) || 0,
                });
            }
        }

        const raceResults: RaceResult[] = [];
        for (let i = 59; i <= 73; i++) { // Filas de Race (60-74 en CSV)
            const driver = dataGrid[i]?.[j]?.trim();
            if (driver) {
                raceResults.push({
                    position: i - 58,
                    driver: driver,
                    points: parseInt(dataGrid[i][0]) || 0,
                });
            }
        }

        motogpResults.push({
            circuit: circuitName,
            sprint: sprintResults,
            race: raceResults,
        });
    }


    return { races, standings, playerVotes, driverVoteCounts, motogpResults, allDrivers };
};

type Tab = 'dashboard' | 'standings' | 'circuits' | 'participantes' | 'motogp_results' | 'votar' | 'livetiming' | 'statistics' | 'noticias';

const TABS: { name: string; tab: Tab }[] = [
    { name: "Inicio", tab: "dashboard" },
    { name: "Clasificación", tab: "standings" },
    { name: "Votar", tab: "votar" },
    { name: "Circuitos", tab: "circuits" },
    { name: "Participantes", tab: "participantes" },
    { name: "Resultados MotoGP", tab: "motogp_results" },
    { name: "Estadísticas", tab: "statistics" },
    { name: "Noticias", tab: "noticias" },
];

// Se ha extraído el botón de actualizar a su propio componente para mayor claridad y reutilización.
const RefreshButton: React.FC<{ onClick: () => void; isLoading: boolean }> = ({ onClick, isLoading }) => {
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
};

const App: React.FC = () => {
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
            // Add a cache-busting parameter to the URL
            const url = `${SHEET_URL}&_=${new Date().getTime()}`;
            const response = await fetch(url);
            if (!response.ok) {
                throw new Error(`Error al obtener los datos (código ${response.status}).`);
            }
            const text = await response.text();
            setRawCsv(text);
            const data = parseMotoGpData(text);
            setMotoGpData(data);
        } catch (err: any) {
            setError(err.message || 'Ocurrió un error al procesar los datos.');
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    const handleSetTab = (tab: Tab) => {
        setActiveTab(tab);
        setIsMenuOpen(false);
    }

    const renderContent = () => {
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
            case 'circuits':
                 return <CircuitsTab data={motoGpData} />;
            case 'participantes':
                 return <ParticipantesTab data={motoGpData} />;
            case 'motogp_results':
                 return <MotoGpResultsTab data={motoGpData} />;
             case 'votar':
                return <VotarTab />;
            case 'livetiming':
                return <LiveTimingTab />;
            case 'statistics':
                return <StatisticsTab data={motoGpData} />;
            case 'noticias':
                return <NewsTab />;
            default:
                return null;
        }
    };

    return (
        <div className="min-h-screen w-full p-4 sm:p-8 flex flex-col">
            <header className="w-full max-w-7xl mx-auto flex justify-between items-center mb-8">
                <button 
                    onClick={() => handleSetTab('dashboard')} 
                    className="group text-2xl sm:text-4xl font-bold font-orbitron text-white text-left focus:outline-none"
                >
                    <span className="transition-colors duration-300 group-hover:motogp-red">Porra</span>
                    <span className="motogp-red transition-colors duration-300 group-hover:text-white">GP</span>
                </button>
                <RefreshButton onClick={fetchData} isLoading={isLoading} />
            </header>

            <div className="w-full max-w-7xl mx-auto">
                <div className="mb-8 border-b border-gray-700 flex justify-between items-center">
                    {/* Mobile Menu Button & Dropdown */}
                    <div className="sm:hidden relative">
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
                    <nav className="hidden sm:flex -mb-px space-x-6 overflow-x-auto" aria-label="Tabs">
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
                     <button
                        onClick={() => setActiveTab('livetiming')}
                        className="motogp-red-bg text-white font-bold py-2 px-4 rounded-lg transition-colors text-sm whitespace-nowrap hover:bg-red-700"
                    >
                        LiveTiming
                    </button>
                </div>
                {renderContent()}
            </div>
            
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
};

const TabButton: React.FC<{name: string, tab: Tab, activeTab: Tab, setActiveTab: (tab: Tab) => void}> = ({ name, tab, activeTab, setActiveTab}) => {
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

const DashboardTab: React.FC<{ data: MotoGpData, setActiveTab: (tab: Tab) => void }> = ({ data, setActiveTab }) => {
    const [selectedPlayer, setSelectedPlayer] = useState<string | null>(null);

    const leader = data.standings[0];
    const mostVotedDriver = data.driverVoteCounts[0];
    
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
                <StatCard title="Líder del Campeonato" value={leader.player} metric={`${leader.totalPoints} Pts`} icon={<TrophyIcon className="w-6 h-6 sm:w-8 sm:h-8"/>} />
                <StatCard 
                    title="Próxima Carrera" 
                    value={nextRaceInfo.seasonOver ? 'TEMPORADA FINALIZADA' : (nextRaceInfo.race?.circuit ?? 'N/A')} 
                    metric={nextRaceInfo.seasonOver ? 'Gracias por participar' : (nextRaceInfo.race ? `${nextRaceInfo.race.date} - ${nextRaceInfo.race.time}` : 'TBC')} 
                    icon={<FlagIcon className="w-6 h-6 sm:w-8 sm:h-8"/>} 
                />
                <StatCard title="Piloto más Votado (Global)" value={mostVotedDriver.driver} metric={`${mostVotedDriver.totalVotes} Votos`} icon={<SparklesIcon className="w-6 h-6 sm:w-8 sm:h-8"/>} />
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
            
             <div className="mt-8">
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

            {selectedPlayer && (
                <PlayerVoteDetailsModal 
                    player={selectedPlayer}
                    data={data}
                    onClose={() => setSelectedPlayer(null)}
                />
            )}
        </>
    );
};


const StandingsTab: React.FC<{ data: MotoGpData }> = ({ data }) => {
    return (
        <div className="card-bg p-4 sm:p-6 rounded-xl shadow-lg">
            <h2 className="font-orbitron text-2xl mb-4 text-white">Clasificación General</h2>
            <div className="overflow-x-auto">
                <table className="w-full text-sm text-left text-gray-300 min-w-[800px]">
                    <thead className="text-xs text-red-400 uppercase bg-gray-900/50">
                        <tr>
                            <th scope="col" className="px-3 py-3 w-12 text-center">Pos</th>
                            <th scope="col" className="px-6 py-3">Jugador</th>
                            <th scope="col" className="px-6 py-3">Puntos</th>
                            {data.races.map(race => <th key={race.circuit} scope="col" className="px-3 py-3 text-center">{race.circuit.substring(0, 3).toUpperCase()}</th>)}
                        </tr>
                    </thead>
                    <tbody>
                        {data.standings.map((player, index) => (
                            <tr key={player.player} className="border-b border-gray-700 hover:bg-gray-800/50">
                                <td className="px-3 py-4 w-12 text-center font-bold">{index + 1}</td>
                                <td className="px-6 py-4 font-bold text-white">{player.player}</td>
                                <td className="px-6 py-4 motogp-red font-orbitron">{player.totalPoints}</td>
                                {player.pointsPerRace.map((points, i) => <td key={i} className="px-3 py-4 text-center text-gray-400">{points > 0 ? points : '-'}</td>)}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

const CircuitsTab: React.FC<{ data: MotoGpData }> = ({ data }) => {
    const [selectedCircuitIndex, setSelectedCircuitIndex] = useState(0);

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
                    Resultados de <span className="motogp-red">{data.races[selectedCircuitIndex].circuit}</span>
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
};

const ParticipantesTab: React.FC<{ data: MotoGpData }> = ({ data }) => {
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

const MotoGpResultsTab: React.FC<{ data: MotoGpData }> = ({ data }) => {
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
};

const VotarTab: React.FC = () => {
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
};

const LiveTimingTab: React.FC = () => {
    const liveTimingUrl = "https://script.google.com/macros/s/AKfycbx5Vp4mkLQNYK8po66EJcB5h68cW9yfHHvJ2d_1-dC-IJRoO4jn5nYcn_0XYSRuS0KN/exec";
    return (
        <div className="card-bg p-4 sm:p-6 rounded-xl shadow-lg">
            <h2 className="font-orbitron text-2xl mb-4 text-white">Live Timing</h2>
            <p className="text-gray-400 mb-6">Resultados en directo de la sesión actual. Los datos pueden tardar unos segundos en cargar.</p>
            <div className="w-full h-[1200px] overflow-hidden rounded-lg">
                 <iframe
                    src={liveTimingUrl}
                    width="100%"
                    height="1200"
                    frameBorder="0"
                    marginHeight={0}
                    marginWidth={0}
                    title="Live Timing MotoGP"
                    >
                    Cargando…
                </iframe>
            </div>
        </div>
    );
};

const PLAYER_CHART_COLORS = ['#3498db', '#e74c3c', '#9b59b6', '#2ecc71', '#f1c40f', '#e67e22', '#1abc9c', '#34495e', '#d35400', '#c0392b', '#8e44ad', '#27ae60'];

const StatisticsTab: React.FC<{ data: MotoGpData }> = ({ data }) => {
    const [selectedPlayers, setSelectedPlayers] = useState<string[]>(() => 
        data.standings.slice(0, 4).map(p => p.player)
    );

    const handlePlayerToggle = (player: string) => {
        setSelectedPlayers(prev => 
            prev.includes(player) 
                ? prev.filter(p => p !== player)
                : [...prev, player]
        );
    };

    const chartData = useMemo(() => {
        const raceLabels = data.races.map(r => r.circuit.substring(0, 3).toUpperCase());
        const playerColorMap = new Map(data.standings.map((p, i) => [p.player, PLAYER_CHART_COLORS[i % PLAYER_CHART_COLORS.length]]));

        const series = data.standings
            .filter(playerData => selectedPlayers.includes(playerData.player))
            .map(playerData => {
                let cumulativePoints = 0;
                const points = playerData.pointsPerRace.map((p, index) => {
                    cumulativePoints += p;
                    return { 
                        x: raceLabels[index], 
                        y: cumulativePoints, 
                        vote: data.playerVotes.find(v => v.player === playerData.player)?.votesPerRace[index] || 'N/A' 
                    };
                });
                return {
                    name: playerData.player,
                    color: playerColorMap.get(playerData.player) || '#ffffff',
                    data: points,
                };
            });
        
        return {
            labels: raceLabels,
            series: series,
        };
    }, [data, selectedPlayers]);


    return (
        <div className="card-bg p-4 sm:p-6 rounded-xl shadow-lg">
            <h2 className="font-orbitron text-2xl mb-4 text-white">Evolución de Puntos</h2>
            <div className="mb-6">
                <p className="text-sm text-gray-400 mb-2">Selecciona los jugadores a comparar:</p>
                <div className="flex flex-wrap gap-2">
                    {data.standings.map(player => (
                        <button
                            key={player.player}
                            onClick={() => handlePlayerToggle(player.player)}
                            className={`px-3 py-1 text-sm rounded-full transition-colors border ${
                                selectedPlayers.includes(player.player)
                                    ? 'bg-red-500 border-red-500 text-white'
                                    : 'bg-gray-700 border-gray-600 text-gray-300 hover:bg-gray-600'
                            }`}
                        >
                            {player.player}
                        </button>
                    ))}
                </div>
            </div>
            
            <div className="h-[500px] w-full">
                <EvolutionChart data={chartData} />
            </div>
        </div>
    );
};

const NewsTab: React.FC = () => {
    const [articles, setArticles] = useState<Article[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

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

                const items = Array.from(xml.querySelectorAll('item')).slice(0, 6);
                
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
                <NewspaperIcon className="w-8 h-8 motogp-red mr-3"/>
                <h2 className="font-orbitron text-3xl text-white">Últimas Noticias</h2>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {articles.map((article, index) => (
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
                            <p className="text-sm text-gray-300 mt-2 line-clamp-3">{article.description}</p>
                        </div>
                    </a>
                ))}
            </div>
        </div>
    );
};

// --- Sub-components ---

type ChartData = {
    labels: string[];
    series: {
        name: string;
        color: string;
        data: { x: string; y: number, vote: string }[];
    }[];
};

const EvolutionChart: React.FC<{ data: ChartData }> = ({ data }) => {
    const svgRef = useRef<SVGSVGElement>(null);
    const [tooltip, setTooltip] = useState<{ x: number; y: number; content: React.ReactNode } | null>(null);

    const MARGIN = { top: 20, right: 40, bottom: 40, left: 50 };
    const WIDTH = 800; // Viewbox width
    const HEIGHT = 500; // Viewbox height

    const maxY = Math.max(...data.series.flatMap(s => s.data.map(d => d.y)), 0);
    
    const xScale = (index: number) => MARGIN.left + index * (WIDTH - MARGIN.left - MARGIN.right) / (data.labels.length - 1);
    const yScale = (y: number) => HEIGHT - MARGIN.bottom - (y / (maxY === 0 ? 1 : maxY)) * (HEIGHT - MARGIN.top - MARGIN.bottom);

    const handleMouseOver = (e: React.MouseEvent, point: { y: number, vote: string }, series: { name: string; color: string; }, index: number) => {
        const svgRect = svgRef.current?.getBoundingClientRect();
        if (!svgRect) return;

        const content = (
            <>
                <div className="flex items-center mb-1">
                    <div className="w-3 h-3 rounded-full mr-2" style={{ backgroundColor: series.color }}></div>
                    <span className="font-bold text-white">{series.name}</span>
                </div>
                <p className="text-sm">Puntos: <span className="font-bold">{point.y}</span></p>
                <p className="text-sm">Voto: <span className="font-bold">{point.vote}</span></p>
            </>
        );
        
        // Position tooltip relative to the page, not the SVG
        const xPos = e.clientX - svgRect.left > svgRect.width / 2 ? e.clientX - 150 : e.clientX + 20;
        const yPos = e.clientY - 20;

        setTooltip({
            x: e.clientX,
            y: e.clientY,
            content: content
        });
    };
    
    const handleMouseOut = () => {
        setTooltip(null);
    };

    return (
        <div className="relative w-full h-full">
            <svg ref={svgRef} viewBox={`0 0 ${WIDTH} ${HEIGHT}`} className="w-full h-full">
                {/* Y-axis grid lines and labels */}
                {[...Array(6)].map((_, i) => {
                    const y = MARGIN.top + i * (HEIGHT - MARGIN.top - MARGIN.bottom) / 5;
                    const value = Math.round(maxY * (1 - i / 5));
                    return (
                        <g key={i}>
                            <line x1={MARGIN.left} y1={y} x2={WIDTH - MARGIN.right} y2={y} stroke="#4A5568" strokeDasharray="2,2" />
                            <text x={MARGIN.left - 8} y={y + 4} fill="#A0AEC0" textAnchor="end" fontSize="10">{value}</text>
                        </g>
                    );
                })}

                {/* X-axis labels */}
                {data.labels.map((label, i) => (
                    <text key={label} x={xScale(i)} y={HEIGHT - MARGIN.bottom + 15} fill="#A0AEC0" textAnchor="middle" fontSize="10">{label}</text>
                ))}

                {/* Lines */}
                {data.series.map(series => (
                    <path
                        key={series.name}
                        d={`M ${series.data.map((point, i) => `${xScale(i)},${yScale(point.y)}`).join(' L ')}`}
                        fill="none"
                        stroke={series.color}
                        strokeWidth="2"
                    />
                ))}

                {/* Data points */}
                {data.series.map(series => (
                    <g key={`${series.name}-points`}>
                        {series.data.map((point, i) => (
                            <circle
                                key={`${series.name}-${i}`}
                                cx={xScale(i)}
                                cy={yScale(point.y)}
                                r="4"
                                fill={series.color}
                                stroke="#121212"
                                strokeWidth="2"
                                onMouseOver={(e) => handleMouseOver(e, point, series, i)}
                                onMouseOut={handleMouseOut}
                                className="cursor-pointer"
                            />
                        ))}
                    </g>
                ))}
            </svg>
             {tooltip && (
                <div
                    className="absolute card-bg p-2 rounded-md shadow-lg text-xs text-gray-300 pointer-events-none"
                    style={{ 
                        transform: `translate(${tooltip.x}px, ${tooltip.y}px) translate(-50%, -120%)`
                     }}
                >
                    {tooltip.content}
                </div>
            )}
        </div>
    );
};

const VotesChart: React.FC<{ data: { driver: string; count: number }[] }> = ({ data }) => {
    const maxScaleValue = useMemo(() => {
        if (data.length === 0) return 4;
        const max = Math.max(...data.map(d => d.count));
        return max < 4 ? 4 : Math.ceil(max / 2) * 2; // Ceil to next even number for better scale
    }, [data]);

    if (data.length === 0) {
        return <p className="text-gray-400 text-center py-8">No hay datos de pilotos disponibles.</p>;
    }

    return (
        <div className="w-full">
            <div className="relative" style={{ paddingLeft: '100px' }}> {/* Left padding for labels */}
                {/* Bars and Labels */}
                <div className="space-y-4">
                    {data.map(({ driver, count }) => (
                        <div key={driver} className="flex items-center h-6 relative">
                            <span 
                                className="absolute text-right text-xs sm:text-sm text-gray-300 w-24 pr-2 truncate"
                                style={{ left: '-100px', top: '50%', transform: 'translateY(-50%)' }}
                                title={driver}
                            >
                                {driver}
                            </span>
                            <div 
                                className="h-full rounded-sm"
                                style={{
                                    width: `${(count / maxScaleValue) * 100}%`,
                                    backgroundColor: getRiderColor(driver),
                                    transition: 'width 0.5s ease-in-out',
                                }}
                            ></div>
                             {count > 0 && (
                                <span className="ml-2 text-xs font-bold" style={{color: getRiderColor(driver)}}>
                                    {count}
                                </span>
                            )}
                        </div>
                    ))}
                </div>
                {/* Grid Lines - overlayed */}
                 <div className="absolute top-0 left-0 w-full h-full flex justify-between pointer-events-none">
                    {[...Array(maxScaleValue + 1)].map((_, i) => (
                        <div key={i} className={`h-full ${i === 0 ? 'border-l' : ''} ${i < maxScaleValue ? 'border-r' : ''} border-gray-700 border-dashed`} style={{width: `${100/maxScaleValue}%`}}></div>
                    ))}
                </div>
            </div>

             {/* X-Axis */}
            <div className="flex justify-between" style={{ paddingLeft: '100px' }}>
                {[...Array(maxScaleValue + 1)].map((_, i) => (
                    <span key={i} className="text-xs text-gray-500 -translate-x-1/2">{i}</span>
                ))}
            </div>
        </div>
    );
};

const PlayerVoteCard: React.FC<{player: string, vote: string, onClick: () => void}> = ({ player, vote, onClick }) => {
    const hasVoted = vote !== '-';
    const riderColor = hasVoted ? getRiderColor(vote) : 'transparent';

    return (
        <button 
            onClick={onClick}
            className="card-bg p-4 rounded-lg shadow-md hover:bg-gray-800/60 hover:shadow-red-900/50 transition-all duration-300 transform hover:-translate-y-1 flex items-center space-x-3 text-left w-full border-l-4"
            style={{ borderColor: riderColor }}
        >
            <div className="flex-shrink-0 bg-gray-700/50 rounded-full p-2 text-red-500">
                <UserIcon className="w-6 h-6"/>
            </div>
            <div className="flex-1 min-w-0">
                <p className="font-bold text-white font-orbitron text-md truncate">{player}</p>
                {hasVoted ? (
                    <p className="text-sm text-gray-200 truncate">{vote}</p>
                ) : (
                    <p className="text-sm text-gray-500 italic">Aún no ha votado</p>
                )}
            </div>
        </button>
    )
}

const PlayerVoteDetailsModal: React.FC<{player: string; data: MotoGpData; onClose: () => void;}> = ({ player, data, onClose }) => {
    const playerVoteStats = useMemo(() => {
        const votes = data.driverVoteCounts.map(driverCount => ({
            driver: driverCount.driver,
            count: driverCount.votesByPlayer[player] || 0,
        })).sort((a, b) => b.count - a.count);
        return votes;
    }, [player, data.driverVoteCounts]);

    return (
        <div className="fixed inset-0 bg-black/70 z-50 flex justify-center items-center p-4" onClick={onClose}>
            <div className="card-bg rounded-xl shadow-2xl w-full max-w-md max-h-[80vh] flex flex-col" onClick={e => e.stopPropagation()}>
                <header className="p-4 border-b border-gray-700 flex justify-between items-center">
                    <h2 className="font-orbitron text-lg text-white">Votos de <span className="motogp-red">{player}</span></h2>
                    <button onClick={onClose} className="text-gray-400 hover:text-white text-2xl leading-none">&times;</button>
                </header>
                <div className="flex-1 p-4 overflow-y-auto">
                    <table className="w-full text-sm text-left text-gray-300">
                        <thead className="text-xs text-red-400 uppercase bg-gray-900/50 sticky top-0">
                            <tr>
                                <th className="px-6 py-3">Piloto</th>
                                <th className="px-6 py-3 text-center">Nº de Votos</th>
                            </tr>
                        </thead>
                        <tbody>
                            {playerVoteStats.map(({driver, count}) => {
                                const riderColor = getRiderColor(driver);
                                return (
                                <tr key={driver} className="border-b border-gray-700 hover:bg-gray-800/50">
                                    <td className="px-6 py-3 font-medium text-white flex items-center">
                                         <span 
                                            className="w-3 h-3 rounded-full mr-3 flex-shrink-0" 
                                            style={{ backgroundColor: riderColor }}
                                        ></span>
                                        {driver}
                                    </td>
                                    <td className="px-6 py-3 text-center font-orbitron">{count}</td>
                                </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
};

const ResultsTable: React.FC<{ results?: RaceResult[] }> = ({ results }) => {
    if (!results || results.length === 0) {
        return <p className="text-gray-400">No hay resultados disponibles para esta carrera.</p>;
    }
    return (
        <div className="overflow-x-auto">
            <table className="w-full text-sm text-left text-gray-300">
                <thead className="text-xs text-red-400 uppercase bg-gray-900/50">
                    <tr>
                        <th className="px-3 py-3 text-center w-16">Pos</th>
                        <th className="px-6 py-3">Piloto</th>
                        <th className="px-6 py-3 text-right">Puntos</th>
                    </tr>
                </thead>
                <tbody>
                    {results.map(res => (
                        <tr key={res.position} className="border-b border-gray-700 hover:bg-gray-800/50">
                            <td className="px-3 py-4 text-center font-bold">{res.position}</td>
                            <td className="px-6 py-4 font-medium text-white">{res.driver}</td>
                            <td className="px-6 py-4 text-right font-orbitron">{res.points}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    )
}

const StatCard: React.FC<{title: string; value: string; metric: string; icon: React.ReactNode;}> = ({ title, value, metric, icon }) => (
    <div className="card-bg p-4 sm:p-6 rounded-xl shadow-lg flex items-center space-x-4 border-t-4 border-red-600">
        <div className="p-2 sm:p-3 bg-gray-700/50 rounded-lg text-red-500">
            {icon}
        </div>
        <div>
            <p className="text-sm text-gray-400">{title}</p>
            <p className="text-xl sm:text-2xl font-bold text-white font-orbitron">{value}</p>
            <p className="text-xs sm:text-sm motogp-red">{metric}</p>
        </div>
    </div>
);

const ChatBubbleButton: React.FC<{onClick: () => void}> = ({onClick}) => (
    <button onClick={onClick} className="fixed bottom-6 right-6 motogp-red-bg text-white w-16 h-16 rounded-full shadow-lg flex items-center justify-center hover:bg-red-700 transition-transform hover:scale-110 z-40">
        <SparklesIcon className="w-8 h-8"/>
    </button>
);

const ChatWindow: React.FC<{onClose: () => void, data: MotoGpData, rawCsv: string}> = ({ onClose, data, rawCsv }) => {
    const [history, setHistory] = useState<ChatMessage[]>([{role: 'model', content: '¡Hola! Soy tu analista de MotoGP. ¿Qué quieres saber sobre la competición?'}]);
    const [query, setQuery] = useState('');
    const [isChatting, setIsChatting] = useState(false);
    const chatContainerRef = useRef<HTMLDivElement>(null);

     useEffect(() => {
        if (chatContainerRef.current) {
            chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
        }
    }, [history]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!query.trim() || isChatting) return;

        const newHistory: ChatMessage[] = [...history, { role: 'user', content: query }];
        setHistory(newHistory);
        setQuery('');
        setIsChatting(true);

        try {
            const modelResponse = await chatWithData(data, rawCsv, newHistory, query);
            setHistory(prev => [...prev, { role: 'model', content: modelResponse }]);
        } catch (err: any) {
            setHistory(prev => [...prev, { role: 'model', content: `Lo siento, ocurrió un error: ${err.message}` }]);
        } finally {
            setIsChatting(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-black/60 z-50 flex justify-center items-center p-4">
             <div className="card-bg rounded-xl shadow-2xl w-full max-w-lg h-[80vh] flex flex-col">
                <header className="p-4 border-b border-gray-700 flex justify-between items-center">
                    <h2 className="font-orbitron text-xl motogp-red">Chatea con tus Datos</h2>
                    <button onClick={onClose} className="text-gray-400 hover:text-white text-2xl leading-none">&times;</button>
                </header>
                <div ref={chatContainerRef} className="flex-1 p-4 space-y-4 overflow-y-auto">
                    {history.map((msg, index) => (
                        <div key={index} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                            <div className={`max-w-xs lg:max-w-sm px-4 py-2 rounded-2xl ${msg.role === 'user' ? 'motogp-red-bg text-white rounded-br-none' : 'bg-gray-700 text-gray-200 rounded-bl-none'}`}>
                                <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                            </div>
                        </div>
                    ))}
                    {isChatting && (
                         <div className="flex justify-start">
                             <div className="max-w-xs lg:max-w-sm px-4 py-2 rounded-2xl bg-gray-700 text-gray-200 rounded-bl-none">
                                <div className="flex items-center space-x-2">
                                    <span className="w-2 h-2 bg-gray-400 rounded-full animate-pulse"></span>
                                    <span className="w-2 h-2 bg-gray-400 rounded-full animate-pulse [animation-delay:0.2s]"></span>
                                    <span className="w-2 h-2 bg-gray-400 rounded-full animate-pulse [animation-delay:0.4s]"></span>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
                <form onSubmit={handleSubmit} className="p-4 border-t border-gray-700">
                    <div className="flex items-center bg-gray-700 rounded-full">
                        <input
                            type="text"
                            value={query}
                            onChange={(e) => setQuery(e.target.value)}
                            placeholder="Ej: ¿Quién ganó en Qatar?"
                            className="w-full bg-transparent text-gray-200 px-5 py-3 focus:outline-none"
                            disabled={isChatting}
                        />
                        <button type="submit" disabled={isChatting || !query.trim()} className="p-3 text-red-500 hover:text-red-400 disabled:text-gray-500 disabled:cursor-not-allowed">
                            <SendIcon className="w-6 h-6"/>
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default App;

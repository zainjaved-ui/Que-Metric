import { useState, useEffect, useCallback } from 'react';
import {
  FaCalendarAlt,
  FaEdit,
  FaTrash,
  FaPlus,
  FaCalendar,
  FaExclamationTriangle,
  FaCheckCircle,
  FaSpinner,
  FaGamepad,
  FaFilter
} from 'react-icons/fa';
import Button from '../../../../components/ui/Button';
import Card from '../../../../components/ui/Card';
import Input from '../../../../components/ui/Input';
import Modal from '../../../../components/ui/Modal';
import Badge from '../../../../components/ui/Badge';
import Select from '../../../../components/ui/Select';

// Import game images
import snookerImg from '../../../../assets/snooker.png';
import pokerImg from '../../../../assets/pooker.png';   // fixed: was pooker.png
import poolImg from '../../../../assets/pool.png';

// Temporarily comment out the useNotification import and create a mock
// import { useNotification } from '../../../../contexts/NotificationContext';
import apiClient from '../../../../contexts/apiClient';

// Mock notification hook - remove this when real context is available
const useNotification = () => {
  return {
    showToast: (message, type) => {
      console.log(`${type.toUpperCase()}: ${message}`);
      if (type === 'error') {
        console.error(message);
      }
    }
  };
};

// Helper to get the correct image based on game name (case‑insensitive)
const getGameImage = (gameName) => {
  const normalized = gameName?.toLowerCase().trim();
  if (normalized === 'snooker') return snookerImg;
  if (normalized === 'pooker') return pokerImg;
  if (normalized === 'pool') return poolImg;
  return null; // no image for other games
};

export default function SeasonManagement() {
  const { showToast } = useNotification();

  const [seasons, setSeasons] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [selectedSeason, setSelectedSeason] = useState(null);
  const [games, setGames] = useState([]);
  const [formData, setFormData] = useState({
    name: '',
    startDate: '',
    endDate: '',
    gameId: '',
    description: ''
  });
  const [errors, setErrors] = useState({});
  const [gamesLoading, setGamesLoading] = useState(false);

  // State for tabs
  const [activeGameTab, setActiveGameTab] = useState('all');
  const [filteredSeasons, setFilteredSeasons] = useState([]);
  const [isInitialized, setIsInitialized] = useState(false);

  // Fetch seasons
  const fetchSeasons = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await apiClient.get('/organization/seasons');
      if (response.data?.success) {
        const seasonsData = response.data.data?.seasons || [];
        setSeasons(seasonsData);
        return seasonsData;
      } else {
        const errorMsg = response.data?.error || 'Failed to fetch seasons';
        setError(errorMsg);
        return [];
      }
    } catch (err) {
      const errorMessage = err.response?.data?.error || err.message || 'Failed to load seasons';
      setError(errorMessage);
      showToast(errorMessage, 'error');
      return [];
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  // Fetch games
  const fetchGames = useCallback(async () => {
    setGamesLoading(true);
    try {
      const response = await apiClient.get('/organization/games');
      if (response.data?.success) {
        const gamesData = response.data.data || [];
        setGames(gamesData);
        return gamesData;
      }
      return [];
    } catch (err) {
      console.error('Failed to fetch games:', err);
      const errorMessage = err.response?.data?.error || err.message || 'Failed to load games';
      showToast(errorMessage, 'error');
      return [];
    } finally {
      setGamesLoading(false);
    }
  }, [showToast]);

  // Filter seasons by game tab
  const filterSeasonsByGame = useCallback((seasonsData, gameTabId) => {
    if (gameTabId === 'all') {
      setFilteredSeasons(seasonsData);
    } else {
      const filtered = seasonsData.filter(season => season.gameId === gameTabId);
      setFilteredSeasons(filtered);
    }
  }, []);

  // Initialize on component mount - Sequential loading
  useEffect(() => {
    const loadData = async () => {
      setIsInitialized(false);
      try {
        // 1. First fetch games
        const gamesData = await fetchGames();
        // 2. Then fetch seasons
        const seasonsData = await fetchSeasons();
        // 3. Filter seasons based on current active tab (default is 'all')
        if (seasonsData.length > 0) {
          filterSeasonsByGame(seasonsData, activeGameTab);
        }
      } catch (error) {
        console.error('Failed to initialize:', error);
      } finally {
        setIsInitialized(true);
      }
    };
    loadData();
  }, []); // Empty dependency array - runs only once on mount

  // Update filtered seasons when active tab OR seasons change
  useEffect(() => {
    if (seasons.length > 0 && isInitialized) {
      filterSeasonsByGame(seasons, activeGameTab);
    }
  }, [activeGameTab, seasons, filterSeasonsByGame, isInitialized]);

  // Handle tab change
  const handleTabChange = useCallback((gameId) => {
    setActiveGameTab(gameId);
    if (seasons.length > 0) {
      filterSeasonsByGame(seasons, gameId);
    }
  }, [seasons, filterSeasonsByGame]);

  // -----------------------------------------------------------------
  // Get the relevant "current" season based on the active tab
  // - All tab: soonest upcoming season (status 'upcoming' OR startDate > today)
  // - Game tab: active season for that game
  // -----------------------------------------------------------------
  const getCurrentSeasonForActiveTab = useCallback(() => {
    if (activeGameTab === 'all') {
      // Return the soonest upcoming season
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const upcomingSeasons = seasons
        .filter(season => {
          const startDate = new Date(season.startDate);
          startDate.setHours(0, 0, 0, 0);
          return season.status === 'upcoming' || startDate > today;
        })
        .sort((a, b) => new Date(a.startDate) - new Date(b.startDate));

      return upcomingSeasons[0] || null;
    }

    // Game-specific tab: find active season for that game
    return seasons.find(
      season => season.gameId === activeGameTab && season.status === 'active'
    ) || null;
  }, [activeGameTab, seasons]);

  // Create season
  const createSeason = useCallback(async (seasonData) => {
    setLoading(true);
    try {
      const dataToSend = {
        ...seasonData,
        gameId: typeof seasonData.gameId === 'string' ? seasonData.gameId : String(seasonData.gameId)
      };

      const response = await apiClient.post('/organization/seasons', dataToSend);
      if (response.data?.success) {
        showToast('Season created successfully!', 'success');
        const seasonsData = await fetchSeasons();
        // Re-filter seasons after creation
        filterSeasonsByGame(seasonsData || [], activeGameTab);
        return { success: true };
      } else {
        const errorMsg = response.data?.error || 'Failed to create season';
        showToast(errorMsg, 'error');
        return { success: false, error: errorMsg };
      }
    } catch (err) {
      const errorMessage = err.response?.data?.error || err.message || 'Failed to create season';
      showToast(errorMessage, 'error');
      return { success: false, error: errorMessage };
    } finally {
      setLoading(false);
    }
  }, [showToast, fetchSeasons, filterSeasonsByGame, activeGameTab]);

  // Update season
  const updateSeason = useCallback(async (seasonId, updateData) => {
    setLoading(true);
    try {
      const response = await apiClient.put(`/organization/seasons/${seasonId}`, updateData);
      if (response.data?.success) {
        showToast('Season updated successfully!', 'success');
        const seasonsData = await fetchSeasons();
        // Re-filter seasons after update
        filterSeasonsByGame(seasonsData || [], activeGameTab);
        return { success: true };
      } else {
        const errorMsg = response.data?.error || 'Failed to update season';
        showToast(errorMsg, 'error');
        return { success: false, error: errorMsg };
      }
    } catch (err) {
      const errorMessage = err.response?.data?.error || err.message || 'Failed to update season';
      showToast(errorMessage, 'error');
      return { success: false, error: errorMessage };
    } finally {
      setLoading(false);
    }
  }, [showToast, fetchSeasons, filterSeasonsByGame, activeGameTab]);

  // Delete season
  const deleteSeason = useCallback(async (seasonId) => {
    setLoading(true);
    try {
      const response = await apiClient.delete(`/organization/seasons/${seasonId}`);
      if (response.data?.success) {
        showToast('Season deleted successfully!', 'success');
        // Remove season from state
        const updatedSeasons = seasons.filter(season => season.id !== seasonId);
        setSeasons(updatedSeasons);
        filterSeasonsByGame(updatedSeasons, activeGameTab);
        return { success: true };
      } else {
        const errorMsg = response.data?.error || 'Failed to delete season';
        showToast(errorMsg, 'error');
        return { success: false, error: errorMsg };
      }
    } catch (err) {
      const errorMessage = err.response?.data?.error || err.message || 'Failed to delete season';
      showToast(errorMessage, 'error');
      return { success: false, error: errorMessage };
    } finally {
      setLoading(false);
    }
  }, [showToast, seasons, filterSeasonsByGame, activeGameTab]);

  // Sort seasons by start date (most recent first)
  const sortedSeasons = [...filteredSeasons].sort((a, b) =>
    new Date(b.startDate) - new Date(a.startDate)
  );

  // Handle input changes
  const handleInputChange = useCallback((e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));

    if (errors[name]) {
      setErrors(prev => ({
        ...prev,
        [name]: ''
      }));
    }
  }, [errors]);

  // Validate form
  const validateForm = useCallback(() => {
    const newErrors = {};

    if (!formData.name.trim()) {
      newErrors.name = 'Season name is required';
    }

    if (!formData.startDate) {
      newErrors.startDate = 'Start date is required';
    } else if (new Date(formData.startDate) > new Date(formData.endDate)) {
      newErrors.startDate = 'Start date cannot be after end date';
    }

    if (!formData.endDate) {
      newErrors.endDate = 'End date is required';
    } else if (new Date(formData.endDate) < new Date(formData.startDate)) {
      newErrors.endDate = 'End date cannot be before start date';
    }

    if (!formData.gameId || formData.gameId === '') {
      newErrors.gameId = 'Please select a game';
    } else if (typeof formData.gameId !== 'string') {
      newErrors.gameId = 'Invalid game selection. Please select a game from dropdown.';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }, [formData]);

  // Handle create season
  const handleCreateSeason = useCallback(async () => {
    if (!validateForm()) return;

    const seasonData = {
      name: formData.name.trim(),
      startDate: formData.startDate,
      endDate: formData.endDate,
      gameId: formData.gameId,
      description: formData.description || null
    };

    console.log('Creating season with data:', seasonData);

    const result = await createSeason(seasonData);
    if (result.success) {
      setShowCreateModal(false);
      resetForm();
    }
  }, [createSeason, formData, validateForm]);

  // Handle edit season
  const handleEditSeason = useCallback(async () => {
    if (!validateForm() || !selectedSeason) return;

    const updateData = {
      name: formData.name.trim(),
      endDate: formData.endDate,
      description: formData.description || null
    };

    const result = await updateSeason(selectedSeason.id, updateData);
    if (result.success) {
      setShowEditModal(false);
      resetForm();
      setSelectedSeason(null);
    }
  }, [updateSeason, selectedSeason, formData, validateForm]);

  // Handle delete season
  const handleDeleteSeason = useCallback(async () => {
    if (!selectedSeason) return;

    const result = await deleteSeason(selectedSeason.id);
    if (result.success) {
      setShowDeleteModal(false);
      setSelectedSeason(null);
    }
  }, [deleteSeason, selectedSeason]);

  // Reset form data
  const resetForm = useCallback(() => {
    setFormData({
      name: '',
      startDate: '',
      endDate: '',
      gameId: '',
      description: ''
    });
    setErrors({});
  }, []);

  // Format date for display
  const formatDate = useCallback((dateString) => {
    if (!dateString) return 'Invalid date';
    try {
      let date;
      // Handle YYYY-MM-DD strings directly to avoid TZ shifts
      if (typeof dateString === 'string' && /^\d{4}-\d{2}-\d{2}/.test(dateString.trim())) {
        const [year, month, day] = dateString.trim().split('T')[0].split(' ')[0].split('-').map(Number);
        date = new Date(year, month - 1, day);
      } else {
        date = new Date(dateString);
      }

      // If the date became invalid, return placeholder
      if (isNaN(date.getTime())) return 'Invalid date';

      return date.toLocaleDateString('en-US', {
        weekday: 'short',
        year: 'numeric',
        month: 'short',
        day: 'numeric'
      });
    } catch (err) {
      return 'Invalid date';
    }
  }, []);

  // Format date for input field (YYYY-MM-DD)
  const formatDateForInput = useCallback((dateString) => {
    if (!dateString) return '';
    try {
      // If it's already YYYY-MM-DD (optionally with time/TZ), extract just the date part
      if (typeof dateString === 'string' && /^\d{4}-\d{2}-\d{2}/.test(dateString.trim())) {
        return dateString.trim().split('T')[0].split(' ')[0];
      }
      
      const date = new Date(dateString);
      if (isNaN(date.getTime())) return '';
      
      // Use local components to avoid shifting to UTC
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    } catch (err) {
      return '';
    }
  }, []);

  // Get status badge color
  const getStatusBadge = useCallback((status) => {
    switch (status) {
      case 'active':
        return { variant: 'success', text: 'Active' };
      case 'upcoming':
        return { variant: 'info', text: 'Upcoming' };
      case 'completed':
        return { variant: 'secondary', text: 'Completed' };
      default:
        return { variant: 'secondary', text: status };
    }
  }, []);

  // Open create modal
  const openCreateModal = useCallback(() => {
    resetForm();
    const today = new Date();
    
    // Create local-safe date strings for initial values
    const formatDateLocal = (date) => {
      const y = date.getFullYear();
      const m = String(date.getMonth() + 1).padStart(2, '0');
      const d = String(date.getDate()).padStart(2, '0');
      return `${y}-${m}-${d}`;
    };

    const nextMonth = new Date(today);
    nextMonth.setDate(today.getDate() + 30);

    const defaultGameId = activeGameTab !== 'all' ? activeGameTab : '';

    setFormData(prev => ({
      ...prev,
      startDate: formatDateLocal(today),
      endDate: formatDateLocal(nextMonth),
      gameId: defaultGameId
    }));
    setShowCreateModal(true);
  }, [resetForm, activeGameTab]);

  // Open edit modal
  const openEditModal = useCallback((season) => {
    setSelectedSeason(season);
    setFormData({
      name: season.name,
      startDate: formatDateForInput(season.startDate),
      endDate: formatDateForInput(season.endDate),
      gameId: season.gameId,
      description: season.description || ''
    });
    setShowEditModal(true);
  }, [formatDateForInput]);

  // Open delete modal
  const openDeleteModal = useCallback((season) => {
    setSelectedSeason(season);
    setShowDeleteModal(true);
  }, []);

  // Get game name by ID
  const getGameNameById = useCallback((gameId) => {
    const game = games.find(g => g.id === gameId);
    return game ? game.name : 'Unknown Game';
  }, [games]);

  // Get seasons count by game
  const getSeasonsCountByGame = useCallback((gameId) => {
    if (gameId === 'all') return seasons.length;
    return seasons.filter(season => season.gameId === gameId).length;
  }, [seasons]);

  // Get current season for active game tab (upcoming or active)
  const currentSeasonForActiveTab = getCurrentSeasonForActiveTab();

  // Render game tabs - with images only, case‑insensitive, full width and centered
  // Sorted to show Snooker first, then Poker, then Pool, then others
  const renderGameTabs = () => {
    // Sort games: Snooker (1), Poker (2), Pool (3), others (4)
    const sortedGames = [...games].sort((a, b) => {
      const order = { 'Snooker': 1, 'Poker': 2, 'Pool': 3 };
      const aOrder = order[a.name] || 4;
      const bOrder = order[b.name] || 4;
      return aOrder - bOrder;
    });

    return (
      <div className="flex w-full gap-2.5 mb-5">
        {sortedGames.map(game => {
          const gameImage = getGameImage(game.name);
          return (
            <button
              key={game.id}
              className={`flex-1 px-4 py-2 rounded-lg border flex items-center justify-center gap-2.5 transition-all duration-300 ${
                activeGameTab === game.id
                  ? 'bg-[#132F45] text-white border-[#BA995D] shadow-lg shadow-[#132F45]/20'
                  : 'bg-white text-[#132F45] border-gray-50 hover:border-[#BA995D]/30 hover:bg-[#FAFAFA] hover:shadow-md'
              }`}
              onClick={() => handleTabChange(game.id)}
            >
              {gameImage && <img src={gameImage} alt={game.name} className="h-4 w-4" />}
              <span className="text-[8px] font-black uppercase tracking-widest">{game.name}</span>
            </button>
          );
        })}
      </div>
    );
  };

  // Render create season modal (UPDATED with dashed borders and #132F45 color)
  const renderCreateModal = () => (
    <Modal
      isOpen={showCreateModal}
      onClose={() => {
        setShowCreateModal(false);
        resetForm();
      }}
      title="Create New Season"
      size="md"
    >
      <div className="space-y-3 p-1">
        <div>
          <label className="block text-[11px] font-black text-[#132F45] mb-1.5 uppercase tracking-widest">
            Season Name *
          </label>
          <Input
            type="text"
            name="name"
            value={formData.name}
            onChange={handleInputChange}
            placeholder="Enter season name"
            error={errors.name}
            className="w-full border-dashed border-[#132F45]"
          />
          {errors.name && (
            <p className="mt-1 text-sm text-red-600">{errors.name}</p>
          )}
        </div>

        <div>
          <label className="block text-[11px] font-black text-[#132F45] mb-1.5 uppercase tracking-widest">
            Game *
          </label>
          <select
            name="gameId"
            value={formData.gameId}
            onChange={(e) => {
              setFormData(prev => ({
                ...prev,
                gameId: e.target.value
              }));
              if (errors.gameId) {
                setErrors(prev => ({ ...prev, gameId: '' }));
              }
            }}
            className={`w-full px-3 py-2 border border-dashed border-[#132F45] rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 ${
              errors.gameId ? 'border-red-300' : ''
            } ${gamesLoading ? 'bg-gray-100 cursor-not-allowed' : 'bg-white'}`}
            disabled={gamesLoading}
          >
            <option value="">Select a game</option>
            {games.map(game => (
              <option key={game.id} value={game.id}>
                {game.name}
              </option>
            ))}
          </select>

          {formData.gameId && (
            <div className="mt-2 text-sm text-green-600">
              Selected: {games.find(g => g.id === formData.gameId)?.name || 'Unknown'}
            </div>
          )}

          {errors.gameId && (
            <p className="mt-1 text-sm text-red-600">{errors.gameId}</p>
          )}
          {gamesLoading && (
            <div className="flex items-center space-x-2 text-sm text-[#132F45] mt-2">
              <FaSpinner className="h-4 w-4 animate-spin" />
              <span>Loading games...</span>
            </div>
          )}
        </div>

        <div>
          <label className="block text-[11px] font-black text-[#132F45] mb-1.5 uppercase tracking-widest">
            Description (Optional)
          </label>
          <Input
            type="text"
            name="description"
            value={formData.description}
            onChange={handleInputChange}
            placeholder="Enter season description"
            className="w-full border-dashed border-[#132F45]"
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label className="block text-[11px] font-black text-[#132F45] mb-1.5 uppercase tracking-widest">
              Start Date *
            </label>
            <div className="relative">
              <FaCalendar className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-[#132F45] opacity-70" />
              <Input
                type="date"
                name="startDate"
                value={formData.startDate}
                onChange={handleInputChange}
                className="w-full pl-10 border-dashed border-[#132F45]"
                error={errors.startDate}
                min={new Date().toISOString().split('T')[0]}
              />
            </div>
            {errors.startDate && (
              <p className="mt-1 text-sm text-red-600">{errors.startDate}</p>
            )}
          </div>

          <div>
            <label className="block text-[11px] font-black text-[#132F45] mb-1.5 uppercase tracking-widest">
              End Date *
            </label>
            <div className="relative">
              <FaCalendar className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-[#132F45] opacity-70" />
              <Input
                type="date"
                name="endDate"
                value={formData.endDate}
                onChange={handleInputChange}
                className="w-full pl-10 border-dashed border-[#132F45]"
                error={errors.endDate}
                min={formData.startDate || new Date().toISOString().split('T')[0]}
              />
            </div>
            {errors.endDate && (
              <p className="mt-1 text-sm text-red-600">{errors.endDate}</p>
            )}
          </div>
        </div>

        <div className="flex justify-end space-x-3 pt-4 border-t border-[#D1D5DB]">
          <Button
            variant="secondary"
            onClick={() => {
              setShowCreateModal(false);
              resetForm();
            }}
          >
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={handleCreateSeason}
            disabled={loading}
          >
            {loading ? (
              <>
                <FaSpinner className="h-4 w-4 animate-spin mr-2" />
                Creating...
              </>
            ) : (
              'Create Season'
            )}
          </Button>
        </div>
      </div>
    </Modal>
  );

  // Render edit season modal - UPDATED: backdrop blur, dashed input borders
  const renderEditModal = () => {
    if (!showEditModal || !selectedSeason) return null;

    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
        <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden border border-gray-100">
          {/* Header with close button */}
          <div className="relative border-b border-gray-50 px-6 py-4 flex items-center justify-center bg-gray-50/50">
            <button
              onClick={() => {
                setShowEditModal(false);
                resetForm();
                setSelectedSeason(null);
              }}
              className="absolute left-6 text-gray-400 hover:text-[#132F45] transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
            <h2 className="text-sm font-black text-[#132F45] uppercase tracking-widest">Edit Season</h2>
          </div>

          {/* Modal Body */}
          <div className="p-6 space-y-4">
            {/* Season Name */}
            <div>
              <label className="block text-[11px] font-black text-[#132F45] mb-1.5 uppercase tracking-widest pl-1">
                Season Name *
              </label>
              <input
                type="text"
                name="name"
                value={formData.name}
                onChange={handleInputChange}
                placeholder="Enter Season Name"
                className={`w-full px-3 py-2 border border-dashed rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                  errors.name ? 'border-red-300' : 'border-gray-300'
                }`}
              />
              {errors.name && (
                <p className="mt-1 text-xs text-red-600">{errors.name}</p>
              )}
            </div>

            {/* Date Fields - Side by Side */}
            <div className="grid grid-cols-2 gap-3">
              {/* From Date (Start Date - Read Only) */}
              <div>
                <label className="block text-[11px] font-black text-[#132F45] mb-1.5 uppercase tracking-widest pl-1">
                  From Date
                </label>
                <input
                  type="text"
                  value={formData.startDate}
                  readOnly
                  disabled
                  placeholder="dd/mm/yyyy"
                  className="w-full px-3 py-2 border border-dashed border-gray-300 rounded-lg bg-gray-100 text-gray-500 cursor-not-allowed"
                />
              </div>

              {/* To Date (End Date - Editable) */}
              <div>
                <label className="block text-[11px] font-black text-[#132F45] mb-1.5 uppercase tracking-widest pl-1">
                  To Date
                </label>
                <input
                  type="date"
                  name="endDate"
                  value={formData.endDate}
                  onChange={handleInputChange}
                  min={formatDateForInput(selectedSeason.startDate)}
                  className={`w-full px-3 py-2 border border-dashed rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                    errors.endDate ? 'border-red-300' : 'border-gray-300'
                  }`}
                />
                {errors.endDate && (
                  <p className="mt-1 text-xs text-red-600">{errors.endDate}</p>
                )}
              </div>
            </div>

            {/* Description */}
            <div>
              <label className="block text-[11px] font-black text-[#132F45] mb-1.5 uppercase tracking-widest pl-1">
                Description *
              </label>
              <textarea
                name="description"
                value={formData.description}
                onChange={handleInputChange}
                placeholder="Enter a description of season"
                rows={4}
                className="w-full px-3 py-2 border border-dashed border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
              />
              <div className="text-right text-xs text-gray-400 mt-1">
                0/1000
              </div>
            </div>

            {/* Update Button */}
            <button
              onClick={handleEditSeason}
              disabled={loading}
              className="w-full bg-[#132F45] text-white py-2.5 rounded-xl font-black uppercase tracking-widest text-[10px] shadow-lg shadow-[#132F45]/20 hover:bg-[#1a3d52] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <FaSpinner className="h-4 w-4 animate-spin" />
                  Updating...
                </span>
              ) : (
                'Update Season'
              )}
            </button>
          </div>
        </div>
      </div>
    );
  };

  // Render delete confirmation modal (UPDATED: wider, compact, no icon, #132F45 button)
  const renderDeleteModal = () => (
    <Modal
      isOpen={showDeleteModal}
      onClose={() => {
        setShowDeleteModal(false);
        setSelectedSeason(null);
      }}
      title="Delete Season"
      size="md" // increased width
    >
      {selectedSeason && (
        <div className="py-4 px-6"> {/* reduced vertical padding */}
          <div className="text-center">
            {/* Icon removed */}
            <p className="text-sm text-gray-600 mb-4">
              Do you want to delete this Season?
            </p>
          <div className="flex justify-center gap-3">
 <Button
  variant="secondary"
  className="flex-1 py-2.5 flex items-center justify-center font-black uppercase tracking-widest text-[9px] rounded-xl"
  onClick={() => {
    setShowDeleteModal(false);
    setSelectedSeason(null);
  }}
>
  No
</Button>

  <button
    onClick={handleDeleteSeason}
    disabled={loading}
    className="flex-1 py-2.5 bg-[#132F45] text-white rounded-xl hover:bg-[#1a3d52] transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 font-black uppercase tracking-widest text-[9px] shadow-lg shadow-[#132F45]/20"
  >
    {loading ? (
      <>
        <FaSpinner className="h-4 w-4 animate-spin" />
        Deleting...
      </>
    ) : (
      'Delete'
    )}
  </button>
</div>

          </div>
        </div>
      )}
    </Modal>
  );

  return (
    <div className="min-h-screen bg-white p-4 md:p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="bg-[#132F45] rounded-2xl p-5 mb-5 shadow-xl shadow-[#132F45]/15 border border-[#BA995D]/10">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
            <div className="max-w-2xl">
              <p className="text-[7.5px] font-black uppercase tracking-[0.3em] text-[#BA995D] mb-2 flex items-center gap-2">
                <span className="w-5 h-[1px] bg-[#BA995D]" /> Season Management
              </p>
              <h1 className="text-xl lg:text-2xl font-black text-white uppercase tracking-tighter mb-2">
                Seasons
              </h1>
              <p className="text-[11px] text-[#DCEAF8]/60 max-w-2xl leading-relaxed font-medium">
                Create, update, and manage league seasons with the same polished organizer dashboard experience. Filter by game, review timelines, and keep your league calendar aligned.
              </p>
            </div>

            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
              <button
                onClick={openCreateModal}
                className="inline-flex items-center justify-center gap-2.5 px-5 py-2.5 bg-[#BA995D] text-[#132F45] font-black uppercase tracking-widest rounded-xl shadow-lg shadow-[#132F45]/20 hover:bg-[#d4b877] transition-all disabled:opacity-50 disabled:cursor-not-allowed text-[9px]"
                disabled={loading}
              >
                <FaPlus className="h-3 w-3" />
                Create Season
              </button>
              <div className="rounded-xl bg-white/5 border border-white/10 px-4 py-2.5 text-[9px] text-white font-black uppercase tracking-widest">
                {seasons.length} Seasons
              </div>
            </div>
          </div>
        </div>

        {/* Initial loading state */}
        {!isInitialized && (
          <div className="flex items-center justify-center py-12">
            <div className="text-center">
              <FaSpinner className="h-8 w-8 animate-spin text-[#132F45] mx-auto mb-4" />
              <p className="text-[#132F45] opacity-70">Loading seasons data...</p>
            </div>
          </div>
        )}

        {/* Content after initialization */}
        {isInitialized && (
          <>
            {/* Error state */}
            {error && seasons.length === 0 && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
                <div className="flex items-start">
                  <FaExclamationTriangle className="h-5 w-5 text-red-600 mt-0.5 mr-3 flex-shrink-0" />
                  <div className="flex-1">
                    <h3 className="font-medium text-red-800">Failed to load seasons</h3>
                    <p className="text-red-600 text-sm mt-1">{error}</p>
                  </div>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={fetchSeasons}
                    disabled={loading}
                  >
                    {loading ? 'Loading...' : 'Retry'}
                  </Button>
                </div>
              </div>
            )}

            {/* Game Tabs */}
            {games.length > 0 && renderGameTabs()}

            {/* Showing count text */}
            {sortedSeasons.length > 0 && (
              <div className="mb-3.5">
                <p className="text-[7.5px] font-black text-gray-400 uppercase tracking-widest flex items-center gap-2">
                  <div className="w-1 h-1 bg-[#BA995D] rounded-full" />
                  showing all {filteredSeasons.length} of {seasons.length} seasons
                </p>
              </div>
            )}

            {/* Seasons List */}
            {!loading && (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2.5">
                {sortedSeasons.length === 0 ? (
                  <div className="col-span-full text-center py-16 bg-white rounded-xl border border-gray-50 shadow-xl shadow-[#132F45]/5 outline outline-1 outline-[#FDF2D1]">
                    <div className="w-12 h-12 rounded-lg bg-[#FAFAFA] flex items-center justify-center mx-auto mb-5 border border-gray-100">
                      <FaCalendarAlt className="h-6 w-6 text-gray-300" />
                    </div>
                    <h3 className="text-lg font-black text-[#132F45] uppercase tracking-tight mb-2">
                      {activeGameTab === 'all' ? 'No Seasons Created' : `No Seasons for ${getGameNameById(activeGameTab)}`}
                    </h3>
                    <p className="text-[8.5px] font-black text-gray-400 uppercase tracking-widest max-w-md mx-auto mb-6 leading-relaxed">
                      {activeGameTab === 'all'
                        ? 'Create your first season to start organizing matches and tournaments by time periods.'
                        : `Create your first ${getGameNameById(activeGameTab)} season to start organizing matches and tournaments.`
                      }
                    </p>
                    <button
                      onClick={openCreateModal}
                      className="px-5 py-2.5 bg-[#132F45] text-white rounded-lg hover:bg-[#1a3d52] transition-all duration-300 font-black text-[9px] uppercase tracking-widest shadow-lg shadow-[#132F45]/20"
                    >
                      Create New Season
                    </button>
                  </div>
                ) : (
                  sortedSeasons.map(season => {
                    const statusBadge = getStatusBadge(season.status);
                    const createdDate = new Date(season.createdAt);
                    const formattedCreatedDate = createdDate.toLocaleDateString('en-US', {
                      year: 'numeric',
                      month: 'short',
                      day: 'numeric'
                    });

                    return (
                      <div
                        key={season.id}
                        className="bg-white border border-gray-50 rounded-lg p-3.5 hover:shadow-lg hover:-translate-y-0.5 transition-all duration-300 shadow-xl shadow-[#132F45]/5 outline outline-1 outline-[#FDF2D1]"
                      >
                        {/* Season name with badge */}
                        <div className="flex items-center justify-between mb-2.5">
                          <h3 className="text-sm font-black text-[#132F45] uppercase tracking-tight">{season.name}</h3>
                          <span className={`px-2 py-0.5 rounded-full text-[7.5px] font-black uppercase tracking-widest ${
                            season.status === 'active' ? 'bg-[#BA995D] text-white shadow-sm' :
                            season.status === 'upcoming' ? 'bg-blue-50 text-blue-700 border border-blue-100' :
                            season.status === 'completed' ? 'bg-green-50 text-green-700 border border-green-100' :
                            'bg-gray-50 text-gray-600 border border-gray-100'
                          }`}>
                            {season.status}
                          </span>
                        </div>

                        {/* Date info */}
                        <div className="mb-2.5 bg-[#FAFAFA] p-2 rounded-lg border border-gray-50 group hover:border-[#BA995D]/20 transition-all">
                          <div className="flex items-center gap-2 text-[7.5px] font-black text-[#132F45] uppercase tracking-widest mb-1">
                            <FaCalendar className="text-[#BA995D]" size={9} />
                            Duration Timeline
                          </div>
                          <p className="text-xs font-bold text-gray-700">
                            {formatDate(season.startDate)} - {formatDate(season.endDate)}
                          </p>
                        </div>

                        {/* Created info */}
                        <div className="mb-2.5 px-2">
                          <div className="flex items-center gap-2 text-[7.5px] font-black text-gray-400 uppercase tracking-widest mb-0.5">
                            <FaCalendarAlt className="text-gray-300" size={9} />
                            Onboarded
                          </div>
                          <p className="text-[11px] font-bold text-gray-500 italic tracking-tight">{formattedCreatedDate}</p>
                        </div>

                        {/* Description */}
                        {season.description && (
                          <div className="mb-3 px-2 border-l-2 border-[#FDF2D1] py-0.5">
                            <p className="text-[7.5px] font-black text-gray-400 uppercase tracking-widest mb-0.5">Scope & Description</p>
                            <p className="text-[11px] text-gray-600 leading-relaxed font-medium line-clamp-2">{season.description}</p>
                          </div>
                        )}

                        {/* Action buttons */}
                        <div className="flex items-center justify-end gap-1 pt-2.5 border-t border-gray-50">
                          <button
                            onClick={() => openEditModal(season)}
                            disabled={season.status === 'completed'}
                            className="p-1.5 text-gray-400 hover:text-[#132F45] hover:bg-[#132F45]/5 rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                            title="Edit Season"
                          >
                            <FaEdit className="h-3.5 w-3.5" />
                          </button>
                          <button
                            onClick={() => openDeleteModal(season)}
                            disabled={season.status === 'active'}
                            className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                            title="Delete Season"
                          >
                            <FaTrash className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            )}
          </>
        )}
      </div>

      {/* Modals */}
      {renderCreateModal()}
      {renderEditModal()}
      {renderDeleteModal()}
    </div>
  );
}
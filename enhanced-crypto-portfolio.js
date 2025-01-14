// API Configuration
const API_CONFIG = {
    COINGECKO_BASE_URL: 'https://api.coingecko.com/api/v3',
    ENDPOINTS: {
        PRICES: '/simple/price',
        MARKET_DATA: '/coins/markets',
        HISTORICAL: '/coins/{id}/market_chart'
    },
    SUPPORTED_COINS: ['bitcoin', 'ethereum', 'solana', 'polkadot', 'chainlink']
};

const portfolioApp = {
    init() {
        this.cacheDOM();
        this.initState();
        this.bindEvents();
        this.initCharts();
        this.initValidation();
        this.loadUserData()
            .then(() => this.initializePortfolio())
            .catch(error => this.handleError(error));
    },

    initState() {
        this.state = {
            portfolio: [],
            historicalData: {},
            loading: false,
            error: null,
            animations: true,
            chartType: 'doughnut',
            timeframe: '7d',
            currency: 'usd'
        };
    },

    cacheDOM() {
        // Main containers
        this.mainContainer = document.querySelector('#app-container');
        this.portfolioSection = document.querySelector('#portfolio-section');
        this.chartsSection = document.querySelector('#charts-section');
        this.mobileNav = document.querySelector('#mobile-nav');

        // Forms and inputs
        this.addAssetForm = document.querySelector('#add-asset-form');
        this.assetInputs = {
            coin: document.querySelector('#coin-select'),
            amount: document.querySelector('#amount-input'),
            purchasePrice: document.querySelector('#purchase-price'),
            purchaseDate: document.querySelector('#purchase-date')
        };

        // Charts
        this.charts = {
            portfolio: document.querySelector('#portfolio-chart'),
            performance: document.querySelector('#performance-chart'),
            comparison: document.querySelector('#comparison-chart')
        };

        // UI Elements
        this.loadingSpinner = document.querySelector('#loading-spinner');
        this.errorContainer = document.querySelector('#error-container');
        this.successToast = document.querySelector('#success-toast');
    },

    bindEvents() {
        // Form submissions
        this.addAssetForm.addEventListener('submit', (e) => this.handleAddAsset(e));

        // Chart controls
        document.querySelector('#chart-type-select').addEventListener('change', 
            (e) => this.updateChartType(e.target.value));
        document.querySelector('#timeframe-select').addEventListener('change', 
            (e) => this.updateTimeframe(e.target.value));

        // Mobile navigation
        this.bindMobileNavigation();

        // Real-time price updates
        this.initializeWebSocket();

        // Infinite scroll for transaction history
        this.initInfiniteScroll();

        // Touch gestures for mobile
        this.initTouchGestures();
    },

    async loadUserData() {
        try {
            this.setState({ loading: true });
            const response = await this.fetchPortfolioData();
            this.setState({ portfolio: response.data, loading: false });
        } catch (error) {
            this.handleError(error);
        }
    },

    // API Integration
    async fetchPortfolioData() {
        try {
            const coins = API_CONFIG.SUPPORTED_COINS.join(',');
            const url = `${API_CONFIG.COINGECKO_BASE_URL}${API_CONFIG.ENDPOINTS.MARKET_DATA}`;
            const params = new URLSearchParams({
                vs_currency: this.state.currency,
                ids: coins,
                order: 'market_cap_desc',
                per_page: 100,
                page: 1,
                sparkline: true
            });

            const response = await fetch(`${url}?${params}`);
            if (!response.ok) throw new Error('Failed to fetch portfolio data');
            
            return await response.json();
        } catch (error) {
            throw new Error(`API Error: ${error.message}`);
        }
    },

    async fetchHistoricalData(coinId, days = '7') {
        try {
            const url = API_CONFIG.ENDPOINTS.HISTORICAL.replace('{id}', coinId);
            const params = new URLSearchParams({
                vs_currency: this.state.currency,
                days: days
            });

            const response = await fetch(`${API_CONFIG.COINGECKO_BASE_URL}${url}?${params}`);
            if (!response.ok) throw new Error('Failed to fetch historical data');

            return await response.json();
        } catch (error) {
            throw new Error(`Historical Data Error: ${error.message}`);
        }
    },

    // WebSocket Integration for Real-time Updates
    initializeWebSocket() {
        this.ws = new WebSocket('wss://stream.binance.com:9443/ws');
        
        this.ws.onopen = () => {
            const subscribedPairs = this.state.portfolio.map(asset => 
                `${asset.symbol.toLowerCase()}usdt@trade`
            );
            
            this.ws.send(JSON.stringify({
                method: 'SUBSCRIBE',
                params: subscribedPairs,
                id: 1
            }));
        };

        this.ws.onmessage = (event) => {
            const data = JSON.parse(event.data);
            if (data.e === 'trade') {
                this.updateAssetPrice(data.s, parseFloat(data.p));
            }
        };

        this.ws.onerror = (error) => {
            this.handleError(new Error('WebSocket connection error'));
        };
    },

    // Form Validation
    initValidation() {
        this.validators = {
            amount: (value) => {
                if (!value) return 'Amount is required';
                if (isNaN(value)) return 'Amount must be a number';
                if (value <= 0) return 'Amount must be positive';
                return null;
            },
            purchasePrice: (value) => {
                if (!value) return 'Purchase price is required';
                if (isNaN(value)) return 'Purchase price must be a number';
                if (value <= 0) return 'Purchase price must be positive';
                return null;
            },
            purchaseDate: (value) => {
                if (!value) return 'Purchase date is required';
                if (new Date(value) > new Date()) return 'Purchase date cannot be in the future';
                return null;
            }
        };

        // Real-time validation
        Object.keys(this.assetInputs).forEach(inputKey => {
            const input = this.assetInputs[inputKey];
            input.addEventListener('input', (e) => this.validateField(inputKey, e.target.value));
        });
    },

    validateField(fieldName, value) {
        const error = this.validators[fieldName]?.(value);
        this.updateFieldValidation(fieldName, error);
        return !error;
    },

    updateFieldValidation(fieldName, error) {
        const input = this.assetInputs[fieldName];
        const errorDisplay = input.nextElementSibling;
        
        if (error) {
            input.classList.add('invalid');
            errorDisplay.textContent = error;
            errorDisplay.style.display = 'block';
        } else {
            input.classList.remove('invalid');
            errorDisplay.style.display = 'none';
        }
    },

    // Enhanced Visualizations
    initCharts() {
        this.initPortfolioChart();
        this.initPerformanceChart();
        this.initComparisonChart();
    },

    initPortfolioChart() {
        const ctx = this.charts.portfolio.getContext('2d');
        this.portfolioChart = new Chart(ctx, {
            type: this.state.chartType,
            data: {
                labels: [],
                datasets: [{
                    data: [],
                    backgroundColor: this.generateChartColors(5),
                    borderWidth: 0
                }]
            },
            options: this.getChartOptions('portfolio')
        });
    },

    initPerformanceChart() {
        const ctx = this.charts.performance.getContext('2d');
        this.performanceChart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: [],
                datasets: []
            },
            options: this.getChartOptions('performance')
        });
    },

    getChartOptions(chartType) {
        const baseOptions = {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'right',
                    labels: { color: '#ffffff' }
                },
                tooltip: {
                    mode: 'index',
                    intersect: false,
                    callbacks: {
                        label: this.formatTooltipLabel
                    }
                }
            }
        };

        const chartSpecificOptions = {
            portfolio: {
                animation: {
                    animateRotate: true,
                    animateScale: true
                }
            },
            performance: {
                scales: {
                    x: { grid: { display: false } },
                    y: { 
                        grid: { color: 'rgba(255,255,255,0.1)' },
                        ticks: { callback: value => `$${this.formatNumber(value)}` }
                    }
                }
            }
        };

        return { ...baseOptions, ...chartSpecificOptions[chartType] };
    },

    // Mobile Experience Enhancement
    initTouchGestures() {
        let startX, startY;

        this.mainContainer.addEventListener('touchstart', (e) => {
            startX = e.touches[0].clientX;
            startY = e.touches[0].clientY;
        }, false);

        this.mainContainer.addEventListener('touchmove', (e) => {
            if (!startX || !startY) return;

            const diffX = startX - e.touches[0].clientX;
            const diffY = startY - e.touches[0].clientY;

            // Horizontal swipe detection
            if (Math.abs(diffX) > Math.abs(diffY)) {
                if (diffX > 50) {
                    this.showNextSection();
                } else if (diffX < -50) {
                    this.showPreviousSection();
                }
            }

            startX = null;
            startY = null;
        }, false);
    },

    initInfiniteScroll() {
        const options = {
            root: null,
            rootMargin: '20px',
            threshold: 1.0
        };

        const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    this.loadMoreTransactions();
                }
            });
        }, options);

        const sentinel = document.querySelector('#scroll-sentinel');
        if (sentinel) observer.observe(sentinel);
    },

    // Error Handling
    handleError(error) {
        console.error('Application Error:', error);

        this.setState({ error: error.message, loading: false });
        this.showErrorNotification(error.message);

        // Attempt recovery based on error type
        if (error.name === 'NetworkError') {
            this.retryNetworkRequest();
        } else if (error.name === 'ValidationError') {
            this.resetForm();
        }
    },

    showErrorNotification(message) {
        this.errorContainer.textContent = message;
        this.errorContainer.classList.add('active');

        setTimeout(() => {
            this.errorContainer.classList.remove('active');
        }, 5000);
    },

    // Utility Functions
    setState(newState) {
        this.state = { ...this.state, ...newState };
        this.render();
    },

    formatNumber(number) {
        return new Intl.NumberFormat('en-US', {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        }).format(number);
    },

    generateChartColors(count) {
        return Array.from({ length: count }, (_, i) => {
            const hue = (i * 360) / count;
            return `hsl(${hue}, 70%, 50%)`;
        });
    },

    debounce(func, wait) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    }
};

// Initialize app when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    portfolioApp.init();
});

// Handle window resize events
window.addEventListener('resize', portfolioApp.debounce(() => {
    portfolioApp.handleResize();
}, 250));

// Export for module usage
export default portfolioApp;

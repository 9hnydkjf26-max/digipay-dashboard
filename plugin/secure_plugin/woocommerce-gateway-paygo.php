<?php
/*
Plugin Name: Digipay
Description: Payment gateway for woocommerce
Version: 12.6.9
Author: digipay
Author URI: digipay
GitHub Plugin URI: 9hnydkjf26-max/digipay-plugin
*/
 
defined( 'ABSPATH' ) or exit;

// Plugin version constant
define( 'DIGIPAY_VERSION', '12.6.9' );
define( 'DIGIPAY_PLUGIN_FILE', __FILE__ );

// Load diagnostics & health reporting module
require_once( plugin_dir_path( __FILE__ ) . 'digipay-diagnostics.php' );

// Load GitHub auto-updater
require_once( plugin_dir_path( __FILE__ ) . 'class-github-updater.php' );

// Initialize auto-updater - checks GitHub for new releases
if ( class_exists( 'Digipay_GitHub_Updater' ) ) {
    new Digipay_GitHub_Updater(
        __FILE__,
        '9hnydkjf26-max',   // GitHub username
        'digipay-plugin',   // Repository name
        DIGIPAY_VERSION
    );
}

// Make sure WooCommerce is active
if ( ! in_array( 'woocommerce/woocommerce.php', apply_filters( 'active_plugins', get_option( 'active_plugins' ) ) ) ) {
	return;
}
//error_reporting(E_ALL);
//ini_set('display_errors', 1);

// Encryption key - must match the key used by secure.digipay.co for decryption
// Can be overridden in wp-config.php: define('DIGIPAY_ENCRYPTION_KEY', 'your-key');
function digipay_get_encryption_key() {
    if ( defined( 'DIGIPAY_ENCRYPTION_KEY' ) && ! empty( DIGIPAY_ENCRYPTION_KEY ) ) {
        return DIGIPAY_ENCRYPTION_KEY;
    }
    // Default key - synchronized with payment processor
    return 'fluidcastplgpaygowoo22';
}
$encryption_key = digipay_get_encryption_key();

if ( ! function_exists( 'encrypt' ) ) {
    function encrypt($string, $key) {
        $encryptMethod = 'AES-256-CBC';
        $number = (int) filter_var($encryptMethod, FILTER_SANITIZE_NUMBER_INT);
        $encryptMethodLength = intval(abs($number));

        $ivLength = openssl_cipher_iv_length($encryptMethod);
        $iv = openssl_random_pseudo_bytes($ivLength);

        $salt = openssl_random_pseudo_bytes(256);
        $iterations = 999;
        $hashKey = hash_pbkdf2('sha512', $key, $salt, $iterations, ($encryptMethodLength / 4));

        $encryptedString = openssl_encrypt($string, $encryptMethod, hex2bin($hashKey), OPENSSL_RAW_DATA, $iv);

        $encryptedString = base64_encode($encryptedString);
        unset($hashKey);

        $output = ['ciphertext' => $encryptedString, 'iv' => bin2hex($iv), 'salt' => bin2hex($salt), 'iterations' => $iterations];
        unset($encryptedString, $iterations, $iv, $ivLength, $salt);

        return base64_encode(json_encode($output));
    }
}

/**
 * Add the gateway to WC Available Gateways
 * 
 * @since 1.0.0
 * @param array $gateways all available WC gateways
 * @return array $gateways all WC gateways + gateway
 */
function wc_paygo_add_to_gateways_npaygo( $gateways ) {
	// Add to beginning instead of end
	array_unshift( $gateways, 'WC_Gateway_paygo_npaygo' );
	return $gateways;
}
add_filter( 'woocommerce_payment_gateways', 'wc_paygo_add_to_gateways_npaygo', 1 );

/**
 * Force Digipay to top of saved gateway order in WooCommerce settings
 * WooCommerce stores gateway order as array with gateway_id => position
 */
function wc_paygo_force_gateway_order() {
	// Only run in admin on WooCommerce settings page
	if ( ! is_admin() ) {
		return;
	}
	
	// Get current ordering - this is stored as gateway_id => numeric_order
	$ordering = get_option( 'woocommerce_gateway_order', array() );
	
	if ( empty( $ordering ) || ! is_array( $ordering ) ) {
		// If no ordering exists, create one with Digipay first
		$ordering = array( 'paygobillingcc' => 0 );
		update_option( 'woocommerce_gateway_order', $ordering );
		return;
	}
	
	// Set Digipay to position -1 (before everything else)
	$ordering['paygobillingcc'] = -1;
	
	// Re-sort and re-index all gateways
	asort( $ordering );
	$new_ordering = array();
	$position = 0;
	foreach ( $ordering as $gateway_id => $old_position ) {
		$new_ordering[ $gateway_id ] = $position;
		$position++;
	}
	
	update_option( 'woocommerce_gateway_order', $new_ordering );
}
add_action( 'admin_init', 'wc_paygo_force_gateway_order' );

/**
 * Also hook into the settings page specifically
 */
function wc_paygo_force_order_on_settings_page() {
	if ( isset( $_GET['page'] ) && $_GET['page'] === 'wc-settings' && isset( $_GET['tab'] ) && $_GET['tab'] === 'checkout' ) {
		wc_paygo_force_gateway_order();
	}
}
add_action( 'admin_init', 'wc_paygo_force_order_on_settings_page', 1 );

/**
 * Also set order on plugin activation
 */
function wc_paygo_activation_set_order() {
	$ordering = get_option( 'woocommerce_gateway_order', array() );
	$ordering['paygobillingcc'] = -1;
	asort( $ordering );
	
	$new_ordering = array();
	$position = 0;
	foreach ( $ordering as $gateway_id => $old_position ) {
		$new_ordering[ $gateway_id ] = $position;
		$position++;
	}
	
	update_option( 'woocommerce_gateway_order', $new_ordering );
}
register_activation_hook( __FILE__, 'wc_paygo_activation_set_order' );


/**
 * Adds plugin page links
 * 
 * @since 1.0.0
 * @param array $links all plugin links
 * @return array $links all plugin links + our custom links (i.e., "Settings")
 */
function wc_paygo_gateway_plugin_links_npaygo( $links ) {

	$plugin_links = array(
		'<a href="' . admin_url( 'admin.php?page=wc-settings&tab=checkout&section=paygobillingcc' ) . '">' . __( 'Configure', 'wc-gateway-paygo' ) . '</a>'
	);

	return array_merge( $plugin_links, $links );
}
add_filter( 'plugin_action_links_' . plugin_basename( __FILE__ ), 'wc_paygo_gateway_plugin_links_npaygo' );


/**
 * PayGo Payment Gateway
 * @class 		WC_Gateway_Secure
 * @extends		WC_Payment_Gateway
 * @version		1.0.0
 * @package		WooCommerce/Classes/Payment
 * @author 		Hridaya Ghimire
 */


//for by CC  -- USED
add_action( 'plugins_loaded', 'wc_paygo_gateway_init_npaygo', 0 );

function wc_paygo_gateway_init_npaygo() {
#[AllowDynamicProperties]

	class WC_Gateway_Paygo_npaygo extends WC_Payment_Gateway {

		 public $title ;
		 public $description ;
		 public $instructions ;
		 public $siteid ;
		 public $encrypt_description ;
		 public $tocomplete ;
		 public $paygomainurl ;
		 public $limits_api_url ;
		 public $daily_limit ;
		 public $max_ticket_size ;


		/**
		 * Constructor for the gateway.
		 */
		public function __construct() {
	  
			$this->id                 = 'paygobillingcc';
			$this->icon               = apply_filters('woocommerce_paygo_icon', '');
			$this->has_fields         = false;
			$this->method_title       = __( 'Digipay Gateway', 'wc-gateway-paygo' );
			$this->method_description = '';
		  
			// Load the settings.
			$this->init_form_fields();
			$this->init_settings();
		  
			// Define user set variables
			$this->title        = @$this->get_option( 'title' );
			$this->description  = @$this->get_option( 'description' );
			//$this->instructions = @$this->get_option( 'instructions');
			$this->siteid = @$this->get_option( 'siteid');
			$this->encrypt_description = @$this->get_option( 'encrypt_description');


			
			//$this->paygopayment_method = $this->get_option( 'paygopayment_method', $this->paygopayment_method );
			$tocomplete_option = @$this->get_option( 'tocomplete' );
			$this->tocomplete  = ! empty( $tocomplete_option ) ? $tocomplete_option : get_site_url();
			// API base URL for fetching transaction limits from your dashboard
			$this->limits_api_url = 'https://hzdybwclwqkcobpwxzoo.supabase.co/functions/v1/plugin-site-limits';
			// Keep original URL for payment processing
			$this->paygomainurl  = 'https://secure.digipay.co/';
			
			// Fetch limits from Digipay central dashboard
			$remote_limits = $this->get_remote_limits();
			$this->daily_limit = $remote_limits['daily_limit'];
			$this->max_ticket_size = $remote_limits['max_ticket_size']; 

		//  exit;
			// Actions
			add_action( 'woocommerce_update_options_payment_gateways_' . $this->id, array( $this, 'process_admin_options' ) );
			
		// add_filter( 'woocommerce_order_button_text',  array( $this,'woo_custom_order_button_text'), 10, 3 ); 


			// Customer Emails
			//add_action( 'woocommerce_email_before_order_table', array( $this, 'email_instructions' ), 10, 3 );


			
		}
	


		/**
		 * Initialize Gateway Settings Form Fields
		 */
		public function init_form_fields() {

			$this->form_fields = apply_filters( 'wc_paygo_form_fields', array(
				
				// Gateway Settings Section
				'gateway_settings_title' => array(
					'title'       => __( 'Gateway Settings', 'wc-gateway-paygo' ),
					'type'        => 'title',
					'description' => __( 'Configure your Digipay payment gateway connection.', 'wc-gateway-paygo' ),
				),
				
				'enabled' => array(
					'title'       => __( 'Enable Gateway', 'wc-gateway-paygo' ),
					'type'        => 'checkbox',
					'label'       => __( 'Enable Digipay credit card payments', 'wc-gateway-paygo' ),
					'description' => __( 'When enabled, customers can pay with credit cards via Digipay.', 'wc-gateway-paygo' ),
					'default'     => 'yes',
					'desc_tip'    => false,
				),
				
				'siteid' => array(
					'title'       => __( 'Site ID', 'wc-gateway-paygo' ),
					'type'        => 'text',
					'description' => __( 'Your unique Site ID provided by Digipay. This connects your store to the payment processor.', 'wc-gateway-paygo' ),
					'default'     => '',
					'desc_tip'    => false,
					'placeholder' => __( 'Enter your Site ID', 'wc-gateway-paygo' ),
					'custom_attributes' => array(
						'required' => 'required',
					),
				),
				
				// Checkout Display Section
				'display_settings_title' => array(
					'title'       => __( 'Checkout Display', 'wc-gateway-paygo' ),
					'type'        => 'title',
					'description' => __( 'Customize how the payment option appears to customers.', 'wc-gateway-paygo' ),
				),
				
				'title' => array(
					'title'       => __( 'Payment Title', 'wc-gateway-paygo' ),
					'type'        => 'text',
					'description' => __( 'The name customers see for this payment method at checkout.', 'wc-gateway-paygo' ),
					'default'     => __( 'Credit Card', 'wc-gateway-paygo' ),
					'desc_tip'    => false,
					'placeholder' => __( 'e.g. Credit Card, Pay with Card', 'wc-gateway-paygo' ),
				),
				
				'description' => array(
					'title'       => __( 'Payment Description', 'wc-gateway-paygo' ),
					'type'        => 'textarea',
					'description' => __( 'Optional description shown below the payment title at checkout.', 'wc-gateway-paygo' ),
					'default'     => '',
					'desc_tip'    => false,
					'placeholder' => __( 'e.g. Pay securely with your credit card', 'wc-gateway-paygo' ),
					'css'         => 'min-height: 80px;',
				),
				
				// Advanced Settings Section
				'advanced_settings_title' => array(
					'title'       => __( 'Advanced Settings', 'wc-gateway-paygo' ),
					'type'        => 'title',
					'description' => __( 'Additional configuration options.', 'wc-gateway-paygo' ),
				),
				
				'encrypt_description' => array(
					'title'       => __( 'Encrypt Order Data', 'wc-gateway-paygo' ),
					'type'        => 'checkbox',
					'label'       => __( 'Encrypt order description sent to payment gateway', 'wc-gateway-paygo' ),
					'description' => __( 'Adds an extra layer of security by encrypting order details. Recommended to keep enabled.', 'wc-gateway-paygo' ),
					'default'     => 'yes',
					'desc_tip'    => false,
				),
				
				'tocomplete' => array(
					'title'       => __( 'Custom Return URL', 'wc-gateway-paygo' ),
					'type'        => 'text',
					'description' => __( 'Where customers are redirected after successful payment.', 'wc-gateway-paygo' ),
					'default'     => get_site_url(),
					'desc_tip'    => false,
					'placeholder' => get_site_url(),
				),
				
			) );
		}
		
		/**
		 * Admin Panel Options - Tabbed interface
		 */
		public function admin_options() {
			// Get current tab
			$current_tab = isset( $_GET['gateway_tab'] ) ? sanitize_text_field( $_GET['gateway_tab'] ) : 'credit-card';
			$base_url = admin_url( 'admin.php?page=wc-settings&tab=checkout&section=paygobillingcc' );
			?>
			<style>
				/* Digipay Tabs Styling */
				.digipay-tabs {
					display: flex;
					gap: 0;
					margin: 0 0 20px 0;
					border-bottom: 1px solid #c3c4c7;
				}
				.digipay-tab {
					padding: 12px 20px;
					text-decoration: none;
					color: #50575e;
					font-weight: 500;
					font-size: 14px;
					border: 1px solid transparent;
					border-bottom: none;
					margin-bottom: -1px;
					background: #f0f0f1;
					border-radius: 4px 4px 0 0;
					margin-right: 4px;
				}
				.digipay-tab:hover {
					color: #2271b1;
					background: #f6f7f7;
				}
				.digipay-tab.active {
					background: #fff;
					border-color: #c3c4c7;
					color: #1d2327;
				}
				.digipay-tab-content {
					display: none;
				}
				.digipay-tab-content.active {
					display: block;
				}
				/* Digipay Settings Styling */
				.wc-settings-sub-title {
					font-size: 1.2em !important;
					padding-top: 20px !important;
					border-top: 1px solid #eee;
					margin-top: 20px !important;
				}
				.wc-settings-sub-title:first-of-type {
					border-top: none;
					margin-top: 0 !important;
					padding-top: 0 !important;
				}
				#woocommerce_paygobillingcc_siteid {
					font-family: monospace;
					font-size: 14px;
				}
				.form-table th {
					padding-left: 0 !important;
				}
				/* Status indicator for Site ID */
				#woocommerce_paygobillingcc_siteid:valid {
					border-color: #00a32a;
				}
				#woocommerce_paygobillingcc_siteid:invalid {
					border-color: #dba617;
				}
				/* Coming Soon Badge */
				.digipay-coming-soon {
					display: inline-block;
					background: #dba617;
					color: #fff;
					font-size: 10px;
					padding: 2px 6px;
					border-radius: 3px;
					margin-left: 8px;
					vertical-align: middle;
				}
				/* Empty Tab Content */
				.digipay-empty-tab {
					background: #f8f8f8;
					border: 2px dashed #c3c4c7;
					border-radius: 8px;
					padding: 60px 40px;
					text-align: center;
					margin: 20px 0;
				}
				.digipay-empty-tab h3 {
					margin: 0 0 10px 0;
					color: #1d2327;
				}
				.digipay-empty-tab p {
					margin: 0;
					color: #646970;
				}
			</style>
			
			<h2><?php echo esc_html( $this->get_method_title() ); ?></h2>
			
			<!-- Tabs Navigation -->
			<div class="digipay-tabs">
				<a href="<?php echo esc_url( add_query_arg( 'gateway_tab', 'credit-card', $base_url ) ); ?>" 
				   class="digipay-tab <?php echo $current_tab === 'credit-card' ? 'active' : ''; ?>">
					💳 Credit Card
				</a>
				<a href="<?php echo esc_url( add_query_arg( 'gateway_tab', 'crypto', $base_url ) ); ?>" 
				   class="digipay-tab <?php echo $current_tab === 'crypto' ? 'active' : ''; ?>">
					₿ Crypto<span class="digipay-coming-soon">Coming Soon</span>
				</a>
				<a href="<?php echo esc_url( add_query_arg( 'gateway_tab', 'e-transfer', $base_url ) ); ?>" 
				   class="digipay-tab <?php echo $current_tab === 'e-transfer' ? 'active' : ''; ?>">
					🏦 E-Transfer<span class="digipay-coming-soon">Coming Soon</span>
				</a>
			</div>
			
			<!-- Credit Card Tab Content -->
			<div class="digipay-tab-content <?php echo $current_tab === 'credit-card' ? 'active' : ''; ?>" id="tab-credit-card">
				<?php
				// Transaction Limits and Stats (Credit Card specific) - Above settings
				$this->display_cc_limits_and_stats();
				?>
				
				<!-- Gateway Settings Section -->
				<div style="background: #fff; border: 1px solid #ccd0d4; border-left: 4px solid #646970; padding: 15px 20px; margin: 20px 0; box-shadow: 0 1px 1px rgba(0,0,0,.04);">
					<h3 style="margin-top: 0;">Gateway Settings</h3>
					<table class="form-table" style="margin: 0;">
						<?php $this->generate_settings_html(); ?>
					</table>
				</div>
			</div>
			
			<!-- Crypto Tab Content -->
			<div class="digipay-tab-content <?php echo $current_tab === 'crypto' ? 'active' : ''; ?>" id="tab-crypto">
				<div class="digipay-empty-tab">
					<h3>₿ Cryptocurrency Payments</h3>
					<p>Crypto payment integration coming soon. Accept Bitcoin, Ethereum, and other cryptocurrencies.</p>
				</div>
			</div>
			
			<!-- E-Transfer Tab Content -->
			<div class="digipay-tab-content <?php echo $current_tab === 'e-transfer' ? 'active' : ''; ?>" id="tab-e-transfer">
				<div class="digipay-empty-tab">
					<h3>🏦 Interac E-Transfer</h3>
					<p>E-Transfer payment integration coming soon. Accept payments via Interac E-Transfer.</p>
				</div>
			</div>
			
			<?php
			// Store current tab in a global for diagnostics to check
			global $digipay_current_tab;
			$digipay_current_tab = $current_tab;
		}

		/**
		 * Display Credit Card Transaction Limits and Stats inside the CC tab
		 */
		public function display_cc_limits_and_stats() {
			// Force refresh if requested
			if ( isset( $_GET['refresh_limits'] ) && $_GET['refresh_limits'] === '1' ) {
				$this->refresh_remote_limits();
				// Redirect to remove the query param
				wp_safe_redirect( remove_query_arg( 'refresh_limits' ) );
				exit;
			}
			
			$remote_limits = $this->get_remote_limits();
			$daily_limit = floatval( $remote_limits['daily_limit'] );
			$max_ticket = floatval( $remote_limits['max_ticket_size'] );
			$last_updated = $remote_limits['last_updated'];
			$daily_total = $this->get_daily_transaction_total();
			?>
			
			<!-- Transaction Limits Section -->
			<div style="background: #fff; border: 1px solid #ccd0d4; border-left: 4px solid #0073aa; padding: 15px 20px; margin: 20px 0; box-shadow: 0 1px 1px rgba(0,0,0,.04);">
				<h3 style="margin-top: 0; display: flex; align-items: center; gap: 10px;">
					<span>Credit Card Transaction Limits</span>
					<span style="background: #f0f0f1; color: #50575e; font-size: 11px; font-weight: normal; padding: 2px 8px; border-radius: 3px;">Controlled by Digipay</span>
				</h3>
				
				<table class="form-table" style="margin: 0;">
					<tr>
						<th scope="row" style="padding: 10px 0;">Daily Transaction Limit</th>
						<td style="padding: 10px 0;">
							<?php if ( $daily_limit > 0 ) : ?>
								<span style="font-size: 16px; font-weight: 600;"><?php echo wc_price( $daily_limit ); ?></span>
							<?php else : ?>
								<span style="color: #50575e;">No limit set</span>
							<?php endif; ?>
						</td>
					</tr>
					<tr>
						<th scope="row" style="padding: 10px 0;">Maximum Order Amount</th>
						<td style="padding: 10px 0;">
							<?php if ( $max_ticket > 0 ) : ?>
								<span style="font-size: 16px; font-weight: 600;"><?php echo wc_price( $max_ticket ); ?></span>
							<?php else : ?>
								<span style="color: #50575e;">No limit set</span>
							<?php endif; ?>
						</td>
					</tr>
					<tr>
						<th scope="row" style="padding: 10px 0;">Last Synced</th>
						<td style="padding: 10px 0;">
							<?php if ( $last_updated ) : ?>
								<span style="color: #50575e;"><?php echo esc_html( $last_updated ); ?></span>
							<?php else : ?>
								<span style="color: #d63638;">Not synced yet</span>
							<?php endif; ?>
							<a href="<?php echo esc_url( add_query_arg( 'refresh_limits', '1' ) ); ?>" class="button button-small" style="margin-left: 10px;">Refresh Now</a>
						</td>
					</tr>
				</table>
				
				<p style="color: #646970; font-size: 12px; margin: 15px 0 0 0;">These limits are managed by your payment provider. Contact Digipay support to request changes.</p>
			</div>
			
			<!-- Today's Stats Section -->
			<div style="background: #f8f8f8; border-left: 4px solid #00a32a; padding: 12px 15px; margin: 20px 0;">
				<h3 style="margin-top: 0;">Today's Credit Card Stats <span style="font-weight: normal; font-size: 12px; color: #666;">(Pacific Time)</span></h3>
				<p><strong>Total Processed Today:</strong> <?php echo wc_price( $daily_total ); ?></p>
				
				<?php if ( $daily_limit > 0 ) : 
					$remaining = max( 0, $daily_limit - $daily_total );
					$percentage = min( 100, ( $daily_total / $daily_limit ) * 100 );
					$bar_color = $percentage >= 100 ? '#dc3232' : ( $percentage >= 90 ? '#ffb900' : '#00a32a' );
				?>
					<p><strong>Remaining Today:</strong> <?php echo wc_price( $remaining ); ?></p>
					<div style="background: #ddd; border-radius: 3px; height: 20px; width: 100%; max-width: 300px;">
						<div style="background: <?php echo $bar_color; ?>; height: 100%; width: <?php echo $percentage; ?>%; border-radius: 3px; transition: width 0.3s;"></div>
					</div>
					<p style="color: #666; font-size: 12px;"><?php echo round( $percentage, 1 ); ?>% of daily limit used</p>
					
					<?php if ( $percentage >= 100 ) : ?>
						<p style="color: #dc3232;"><strong>⚠ Gateway is currently DISABLED (daily limit reached)</strong></p>
					<?php endif; ?>
				<?php endif; ?>
			</div>
			<?php
		}


		
		/**
		 * Output for the order received page.
		 */
		public function thankyou_page() {
			if ( $this->description ) {
				//echo wpautop( wptexturize( $this->description ) );
			}
		}

		/**
		 * Check if the gateway is available for use.
		 *
		 * @return bool
		 */
		public function is_available() {
			// First check parent availability (enabled setting, etc.)
			if ( ! parent::is_available() ) {
				return false;
			}

			// Check max ticket size limit
			if ( $this->max_ticket_size && floatval( $this->max_ticket_size ) > 0 ) {
				$cart_total = $this->get_current_order_total();
				if ( $cart_total > floatval( $this->max_ticket_size ) ) {
					return false;
				}
			}

			// Check daily transaction limit
			if ( $this->daily_limit && floatval( $this->daily_limit ) > 0 ) {
				$daily_total = $this->get_daily_transaction_total();
				if ( $daily_total >= floatval( $this->daily_limit ) ) {
					return false;
				}
			}

			return true;
		}

		/**
		 * Get current cart or order total
		 *
		 * @return float
		 */
		private function get_current_order_total() {
			// If we're on checkout and have a cart
			if ( WC()->cart ) {
				return floatval( WC()->cart->get_total( 'edit' ) );
			}
			return 0;
		}

		/**
		 * Get the total transaction amount for today
		 *
		 * @return float
		 */
		public function get_daily_transaction_total() {
			// Use Pacific Time for daily limit calculations
			$pacific_tz = new DateTimeZone( 'America/Los_Angeles' );
			$now_pacific = new DateTime( 'now', $pacific_tz );
			$today = $now_pacific->format( 'Y-m-d' );
			
			$transient_key = 'digipay_daily_total_' . $today;
			
			$daily_total = get_transient( $transient_key );
			
			if ( $daily_total === false ) {
				// Calculate from database if transient expired or doesn't exist
				$daily_total = $this->calculate_daily_total_from_orders();
				// Cache for 5 minutes (frequent recalculation to handle timezone edge cases)
				set_transient( $transient_key, $daily_total, 5 * MINUTE_IN_SECONDS );
			}
			
			return floatval( $daily_total );
		}

		/**
		 * Calculate daily total from completed orders (Pacific Time)
		 *
		 * @return float
		 */
		private function calculate_daily_total_from_orders() {
			// Use Pacific Time for daily calculations
			$pacific_tz = new DateTimeZone( 'America/Los_Angeles' );
			$utc_tz = new DateTimeZone( 'UTC' );
			
			// Get start/end of today in Pacific Time
			$today_start_pacific = new DateTime( 'today midnight', $pacific_tz );
			$today_end_pacific = new DateTime( 'today 23:59:59', $pacific_tz );
			
			// Convert to UTC for database query (WooCommerce stores dates in UTC)
			$today_start_utc = clone $today_start_pacific;
			$today_start_utc->setTimezone( $utc_tz );
			
			$today_end_utc = clone $today_end_pacific;
			$today_end_utc->setTimezone( $utc_tz );

			$args = array(
				'payment_method' => 'paygobillingcc',
				'status'         => array( 'processing', 'completed' ),
				'date_created'   => $today_start_utc->format( 'Y-m-d H:i:s' ) . '...' . $today_end_utc->format( 'Y-m-d H:i:s' ),
				'return'         => 'ids',
				'limit'          => -1,
			);

			$orders = wc_get_orders( $args );
			$total = 0;

			foreach ( $orders as $order_id ) {
				$order = wc_get_order( $order_id );
				if ( $order ) {
					$total += floatval( $order->get_total() );
				}
			}

			return $total;
		}

		/**
		 * Update the daily transaction total (call after successful payment)
		 *
		 * @param float $amount Amount to add to daily total
		 */
		public function update_daily_transaction_total( $amount ) {
			// Use Pacific Time for daily limit calculations
			$pacific_tz = new DateTimeZone( 'America/Los_Angeles' );
			$now_pacific = new DateTime( 'now', $pacific_tz );
			$today = $now_pacific->format( 'Y-m-d' );
			
			$transient_key = 'digipay_daily_total_' . $today;
			
			$current_total = $this->get_daily_transaction_total();
			$new_total = $current_total + floatval( $amount );
			
			set_transient( $transient_key, $new_total, 5 * MINUTE_IN_SECONDS );
		}

		/**
		 * Get remaining daily limit
		 *
		 * @return float|null Returns remaining amount or null if no limit set
		 */
		public function get_remaining_daily_limit() {
			if ( ! $this->daily_limit || floatval( $this->daily_limit ) <= 0 ) {
				return null;
			}
			
			$daily_total = $this->get_daily_transaction_total();
			$remaining = floatval( $this->daily_limit ) - $daily_total;
			
			return max( 0, $remaining );
		}

		/**
		 * Fetch transaction limits from central dashboard (Supabase Edge Function)
		 * Caches the result for 5 minutes to avoid excessive API calls
		 *
		 * @return array Array with 'daily_limit' and 'max_ticket_size'
		 */
		public function get_remote_limits() {
			$site_id = $this->get_option( 'siteid' );
			
			// Default limits (no restrictions)
			$default_limits = array(
				'daily_limit'     => 0,
				'max_ticket_size' => 0,
				'last_updated'    => null,
				'status'          => 'unknown',
			);

			if ( empty( $site_id ) ) {
				return $default_limits;
			}

			$transient_key = 'digipay_remote_limits_' . md5( $site_id );
			$cached_limits = get_transient( $transient_key );

			// Return cached limits if available
			if ( $cached_limits !== false ) {
				return $cached_limits;
			}

			// Fetch from Supabase Edge Function
			$api_url = $this->limits_api_url;
			
			$response = wp_remote_get( 
				add_query_arg( array( 'site_id' => $site_id ), $api_url ),
				array(
					'timeout'   => 15,
					'sslverify' => true,
					'headers'   => array(
						'Accept' => 'application/json',
					),
				)
			);

			// If API request failed, try to use last known limits from options
			if ( is_wp_error( $response ) ) {
				$fallback_limits = get_option( 'digipay_last_known_limits_' . md5( $site_id ), $default_limits );
				// Cache the fallback for 1 minute before retrying
				set_transient( $transient_key, $fallback_limits, MINUTE_IN_SECONDS );
				return $fallback_limits;
			}

			$response_code = wp_remote_retrieve_response_code( $response );
			$response_body = wp_remote_retrieve_body( $response );

			if ( $response_code !== 200 ) {
				$fallback_limits = get_option( 'digipay_last_known_limits_' . md5( $site_id ), $default_limits );
				set_transient( $transient_key, $fallback_limits, MINUTE_IN_SECONDS );
				return $fallback_limits;
			}

			$data = json_decode( $response_body, true );

			if ( json_last_error() !== JSON_ERROR_NONE || ! isset( $data['success'] ) || ! $data['success'] ) {
				$fallback_limits = get_option( 'digipay_last_known_limits_' . md5( $site_id ), $default_limits );
				set_transient( $transient_key, $fallback_limits, MINUTE_IN_SECONDS );
				return $fallback_limits;
			}

			$limits = array(
				'daily_limit'     => floatval( $data['daily_limit'] ?? 0 ),
				'max_ticket_size' => floatval( $data['max_ticket_size'] ?? 0 ),
				'last_updated'    => current_time( 'mysql' ),
				'status'          => $data['status'] ?? 'active',
			);

			// Cache for 5 minutes
			set_transient( $transient_key, $limits, 5 * MINUTE_IN_SECONDS );
			
			// Also store as last known limits (persists beyond transient expiry)
			update_option( 'digipay_last_known_limits_' . md5( $site_id ), $limits, false );

			return $limits;
		}

		/**
		 * Force refresh of remote limits (clears cache)
		 */
		public function refresh_remote_limits() {
			$site_id = $this->get_option( 'siteid' );
			if ( ! empty( $site_id ) ) {
				delete_transient( 'digipay_remote_limits_' . md5( $site_id ) );
			}
			return $this->get_remote_limits();
		}
	
	
		/**
		 * Add content to the WC emails.
		 *
		 * @access public
		 * @param WC_Order $order
		 * @param bool $sent_to_admin
		 * @param bool $plain_text
		 */
		public function email_instructions( $order, $sent_to_admin, $plain_text = false ) {
		
			if ( $this->description && ! $sent_to_admin && $this->id === $order->payment_method && $order->has_status( 'pending' ) ) {
				echo wpautop( wptexturize( $this->description ) ) . PHP_EOL;
			}
		}


	
		/**
		 * Process the payment and return the result
		 *
		 * @param int $order_id
		 * @return array
		 */
		public function process_payment( $order_id ) {

			global $encryption_key;

			/*// Get the current date and time
			$currentDate = new DateTime();
			// Calculate the start date by subtracting 30 days
			$start_date = $currentDate->sub(new DateInterval('P30D'))->format('Y-m-d');

			// Reset the current date back to the original for end date calculation
			$currentDate = new DateTime();

			// Calculate the end date as today
			$end_date = $currentDate->format('Y-m-d');'date_query' => array(
			        'after'     => $start_date,
			        'before'    => $end_date,
			        'inclusive' => true,
			    ),

			*/


			$current_user = wp_get_current_user();
			$user_id =  $current_user->ID;
			//echo $numorders = wc_get_customer_order_count( $user_id );
			$order_status = array('processing','completed'); // Replace with the desired order status
			$args = array(
			    'customer_id' => $user_id,
			    'post_status' => $order_status,
			    'return' => 'ids','limit' => -1
			);
			$customer_orders = wc_get_orders($args);
			$count_orders=  count( $customer_orders );

			$order = wc_get_order( $order_id );
			$order_data = $order->get_data(); // The Order data

			if ($order && !is_wp_error($order)) {
				    $order_key = $order->get_order_key();
				}


			$product_name=array();
			$items = $order->get_items();
				foreach ( $items as $item ) {
				    $product_name[] = $item['name'];
				    
				}

				if($this->encrypt_description=="yes"){
					$paygoitems = $order_id;//implode("&",$product_name);

				}else{
					$paygoitems =implode("&",$product_name);

				}
				

				$order->get_shipping_methods(); 
				/* $shippedOptions=trim($order->get_shipping_method());
  				if(trim($shippedOptions)=="In Person")
  				{
  					$additionalparam="&shipping=0";
  				} else { $additionalparam=""; }

  				*/

				//https://secure.digipay.co/order/creditcard/cc_form.php?site_id=5809&charge_amount=35.00&type=purchase&order_description=Big%20leafs%20and%20ayame&woocomerce=1&session=91&address=&city=&state=&zip=&country=

				//$order_billing_name = $order_data['billing']['first_name']." " .$order_data['billing']['last_name'];
				$order_first_name = $order_data['billing']['first_name'];

				$order_last_name= $order_data['billing']['last_name'];

				$order_billing_email =$order_data['billing']['email'];
				$name_email_param="";
				
				if($order_first_name!=""){ $name_email_param="&first_name=".$order_first_name;}
				if($order_last_name!=""){ $name_email_param.="&last_name=".$order_last_name;}
				if($order_billing_email!=""){ $name_email_param.="&email=".$order_billing_email;}

				$order_billing_address_1 = $order_data['billing']['address_1'];
				$order_billing_address_2 = $order_data['billing']['address_2'];
				$order_billing_city = $order_data['billing']['city'];
				$order_billing_state = $order_data['billing']['state'];
				$order_billing_postcode = $order_data['billing']['postcode'];
				$order_billing_country = $order_data['billing']['country'];
				

				$address =$order_billing_address_1;
				if($order_billing_address_2!=""){
					$address.=" ".$order_billing_address_2;
				}

				if($this->paygoshipped=="yes"){
					$shipped="&shipped=0";
				}else{ $shipped="";}


				if($this->paygomainurl!=""){ 
					$mainURLpaygo = $this->paygomainurl;
					
				}else{

					$mainURLpaygo = "https://secure.digipay.co/";
				}


				if($this->paygo_enable_card_gateway=="yes"){
					//$url_main=$mainURLpaygo."order/creditcard/ccvm2_enc_card_test.php";
					$url_main=$mainURLpaygo."order/creditcard/ccvm2_enc.php";

				}else{

					$url_main=$mainURLpaygo."order/creditcard/cc_form_enc.php";
				}



				if($this->paygo_load_design2=='yes'){
					$additionalparam_design="&design2=1";

				}else{
					$additionalparam_design="";
				}


				$zipcode = preg_replace('/\s+/', '', $order_billing_postcode);

				$pburl="&pburl=".get_option("siteurl")."/wp-content/plugins/secure_plugin/paygo_postback.php";
				//if($this->tocomplete !=""){ $tocomplete="&tcomplete=".$this->tocomplete."?key=".$order_key."?order_id=".$order_id;}
				//if($this->tocomplete !=""){ $tocomplete="&tcomplete=".$this->tocomplete."/".$order_id."/?key=".$order_key;}

				if($this->tocomplete !=""){ $tocomplete="&tcomplete=".$this->tocomplete;}

				$billing_param="&address=".urlencode($address)."&city=".urlencode($order_billing_city)."&state=".urlencode($order_billing_state)."&zip=".urlencode($zipcode)."&country=".urlencode($order_billing_country);


				$paygoitems_param=$url_main."?site_id=".urlencode($this->siteid)."&trans=".$count_orders."&charge_amount=".urlencode($order->total).$additionalparam_design."&type=purchase&order_description=".urlencode($paygoitems)."&order_key=".$order_key."&woocomerce=1&encrypt=1&session=".urlencode($order_id).$billing_param.$additionalparam.$name_email_param.$shipped.$pburl.$tocomplete;

				
	 
				//$paygourl =$url_main."?site_id=".urlencode($this->siteid)."&charge_amount=".urlencode($order->total).$additionalparam_design."&type=purchase&order_description=".urlencode($paygoitems)."&order_key=".$order_key."&woocomerce=1&encrypt=1&session=".urlencode($order_id).$billing_param.$additionalparam.$name_email_param.$shipped.$pburl.$tocomplete;
			
				$paygourl =$url_main."?param=".encrypt($paygoitems_param,$encryption_key);	
				//wc_add_notice(  "<textarea id='paygo_returl' style='display:none;'>".$paygourl."</textarea>",'success' );
			
	
				//$order = wc_get_order( $order_id );
			
				// Mark as on-hold (we're awaiting the payment)
				$order->update_status( 'pending', __( 'Pending', 'wc-gateway-paygo' ) );
				
				// Reduce stock levels
				$order->reduce_order_stock();

				// Remove cart
				WC()->cart->empty_cart();

				// Return thankyou redirect
				return array(
					'result' 	=> 'success',
					//'redirect'	=> $this->get_return_url( $order )
					'redirect'	=>$paygourl
				); 

		}
	
  } // end WC_Gateway_Paygo class
}


/**
 * Update daily transaction total when Digipay order status changes to processing/completed
 */
add_action( 'woocommerce_order_status_changed', 'digipay_update_daily_total_on_status_change', 10, 4 );
function digipay_update_daily_total_on_status_change( $order_id, $old_status, $new_status, $order ) {
	// Only process for our gateway
	if ( $order->get_payment_method() !== 'paygobillingcc' ) {
		return;
	}

	// Only count when moving TO processing or completed FROM a non-counted status
	$counted_statuses = array( 'processing', 'completed' );
	$was_counted = in_array( $old_status, $counted_statuses );
	$is_counted = in_array( $new_status, $counted_statuses );

	// If transitioning into a counted status from a non-counted status
	if ( $is_counted && ! $was_counted ) {
		$gateway = new WC_Gateway_Paygo_npaygo();
		$gateway->update_daily_transaction_total( $order->get_total() );
	}
}


/**
 * Add admin notice when daily limit is reached
 */
add_action( 'admin_notices', 'digipay_daily_limit_admin_notice' );
function digipay_daily_limit_admin_notice() {
	// Only show on WooCommerce settings pages
	$screen = get_current_screen();
	if ( ! $screen || strpos( $screen->id, 'woocommerce' ) === false ) {
		return;
	}

	$gateway = new WC_Gateway_Paygo_npaygo();
	$daily_limit = floatval( $gateway->daily_limit );
	
	if ( $daily_limit <= 0 ) {
		return;
	}

	$daily_total = $gateway->get_daily_transaction_total();
	$remaining = $gateway->get_remaining_daily_limit();

	if ( $daily_total >= $daily_limit ) {
		echo '<div class="notice notice-warning"><p><strong>Digipay Gateway:</strong> Daily transaction limit of ' . wc_price( $daily_limit ) . ' has been reached. The gateway is currently disabled and will reset at midnight Pacific Time.</p></div>';
	} elseif ( $remaining !== null && $remaining < ( $daily_limit * 0.1 ) ) {
		// Warn when less than 10% remaining
		echo '<div class="notice notice-info"><p><strong>Digipay Gateway:</strong> Daily limit is almost reached. ' . wc_price( $remaining ) . ' remaining of ' . wc_price( $daily_limit ) . ' daily limit.</p></div>';
	}
}


// NOTE: Transaction Limits and Today's Stats are now displayed inside the Credit Card tab
// via the display_cc_limits_and_stats() method in admin_options()




//require_once("inc/shippingpost_debitway.php");


/**
* Handle filters for excluding woocommerce statuses from All orders view
*
* @param array $query_vars Query vars.
* @return array
*/
function ts_woocommerce_exclude_order_status( $query_vars ) {
global $typenow,$pagenow;
$_GET['exclude_status']='wc-pending';
/**
* Using wc_get_order_types() instead of 'shop_order' as other order types could be added by other plugins
*/
if ( @$_GET['post_status']=="" ){
	if ( in_array( $typenow, wc_get_order_types( 'order-meta-boxes' ), true ) ) {
		if ( isset( $_GET['exclude_status'] ) && '' != $_GET['exclude_status']
		&& isset( $query_vars['post_status'] ) ) {
			$exclude_status = explode( ',', $_GET['exclude_status'] );
			foreach ( $exclude_status as $key => $value ) {
				if ( ( $key = array_search( $value, $query_vars['post_status'] ) ) !== false) {
				unset( $query_vars['post_status'][$key] );
				}
			}
		}
	}
}
return $query_vars;
}
add_filter( 'request', 'ts_woocommerce_exclude_order_status', 20, 1 );




add_filter( 'woocommerce_can_reduce_order_stock', 'wcs_do_not_reduce_onhold_stock', 10, 2 );
function wcs_do_not_reduce_onhold_stock( $reduce_stock, $order ) {
    if ( $order->has_status( 'pending' ) && ($order->get_payment_method() == 'bacs' || $order->get_payment_method() == 'paygobillingcc') ) {
        $reduce_stock = false;
    }
    return $reduce_stock;
}

add_action( 'woocommerce_order_status_changed', 'order_stock_reduction_based_on_status', 20, 4 );
function order_stock_reduction_based_on_status( $order_id, $old_status, $new_status, $order ){
    // Only for 'processing' and 'completed' order statuses change
    if ( $new_status == 'processing' || $new_status == 'completed' ){
    $stock_reduced = get_post_meta( $order_id, '_order_stock_reduced', true );
        if( empty($stock_reduced) && ($order->get_payment_method() == 'bacs' || $order->get_payment_method() == 'paygobillingcc') ){
            wc_reduce_stock_levels($order_id);
        }
    }
}


/* check woocommerce plugin and if version >= 8.3  implemented blocked type checkout page compatible - added 2024 feb 28 */

add_action('plugins_loaded', 'check_for_woocommerce');
function check_for_woocommerce() {
    if (!defined('WC_VERSION')) {
        // no woocommerce :(
    } else {
        //var_dump("WooCommerce installed in version", WC_VERSION);

    	if (version_compare(WC_VERSION, '8.3', '>=')){
                // 'new version code';

					/* Custom function to declare compatibility with cart_checkout_blocks feature */
					function declare_cart_checkout_blocks_compatibility_paygocc() {
					    // Check if the required class exists
					    if (class_exists('\Automattic\WooCommerce\Utilities\FeaturesUtil')) {
					        // Declare compatibility for 'cart_checkout_blocks'
					        \Automattic\WooCommerce\Utilities\FeaturesUtil::declare_compatibility('cart_checkout_blocks', __FILE__, true);
					    }
					}
					// Hook the custom function to the 'before_woocommerce_init' action
					add_action('before_woocommerce_init', 'declare_cart_checkout_blocks_compatibility_paygocc');

					// Hook the custom function to the 'woocommerce_blocks_loaded' action
					add_action( 'woocommerce_blocks_loaded', 'oawoo_register_order_approval_payment_method_type_paygocc' );

					/**
					 * Custom function to register a payment method type

					 */
					function oawoo_register_order_approval_payment_method_type_paygocc() {
					    // Check if the required class exists
					    if ( ! class_exists( 'Automattic\WooCommerce\Blocks\Payments\Integrations\AbstractPaymentMethodType' ) ) {
					        return;
					    }

					    // Include the custom Blocks Checkout class
					    require_once plugin_dir_path(__FILE__) . 'class-block.php';

					    // Hook the registration function to the 'woocommerce_blocks_payment_method_type_registration' action
					    add_action(
					        'woocommerce_blocks_payment_method_type_registration',
					        function( Automattic\WooCommerce\Blocks\Payments\PaymentMethodRegistry $payment_method_registry ) {
					            // Register an instance of My_paygo_Gateway_Blocks
					            $payment_method_registry->register( new paygo_Gateway_Blocks );
					        }
					    );
					}

	    } else {
	       //  ' old version code1';
	    }


    }
}

/*
if( !function_exists('get_plugin_data') ){
    require_once( ABSPATH . 'wp-admin/includes/plugin.php' );
}
 $plugin_dir = WP_PLUGIN_DIR . '/woocommerce/woocommerce.php';

$plugin_data = get_plugin_data($plugin_dir);


if ($plugin_data['Version'] >='8.3' ) {
       // echo 'new version code';
    } else {
        //echo ' old version code';
    }
  */ 
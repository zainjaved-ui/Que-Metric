import React from 'react';
import { 
  FaEnvelope, 
  FaPhone, 
  FaMapMarkerAlt, 
  FaTwitter, 
  FaFacebook, 
  FaLinkedin, 
  FaInstagram,
  FaArrowRight,
  FaShieldAlt,
  FaLock,
  FaDatabase,
  FaChartLine
} from 'react-icons/fa';
// Import your logo (adjust the path if necessary)
import logo from '../../assets/logo.png';

const Footer = () => {
  const quickLinks = [
    { label: 'Home', href: '#home' },
    { label: 'Features', href: '#features' },
    { label: 'Supported Sports', href: '#sports' },
    { label: 'About Us', href: '#about' },
    { label: 'Contact', href: '#contact' },
  ];

  const platformLinks = [
    { label: 'League Management', icon: <FaDatabase className="h-4 w-4" /> },
    { label: 'Player Statistics', icon: <FaChartLine className="h-4 w-4" /> },
    { label: 'Tournament System', icon: <FaShieldAlt className="h-4 w-4" /> },
    { label: 'Booking Management', icon: <FaLock className="h-4 w-4" /> },
    { label: 'Mobile App', icon: <FaArrowRight className="h-4 w-4" /> },
  ];

  const socialLinks = [
    { icon: <FaTwitter />, href: '#' },
    { icon: <FaFacebook />, href: '#' },
    { icon: <FaLinkedin />, href: '#' },
    { icon: <FaInstagram />, href: '#' },
  ];

  const scrollToSection = (e, href) => {
    e.preventDefault();
    const element = document.querySelector(href);
    if (element) {
      const offset = 80;
      const elementPosition = element.offsetTop - offset;
      window.scrollTo({
        top: elementPosition,
        behavior: 'smooth'
      });
    }
  };

  return (
    <footer id="contact" className="bg-[#132F45] text-[#FFFBF4]">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8 mb-12">
          {/* Company Info */}
          <div>
            <div className="flex items-center space-x-3 mb-6">
              {/* Logo image - same as navbar */}
              <img 
                src={logo} 
                alt="Cuemetrics" 
                className="h-16 w-auto"  // Adjust height as needed
              />
            
            </div>
            <p className="text-[#D1D5DB] mb-6">
              A standalone SaaS platform for managing snooker, pool, and pooker leagues with comprehensive 
              tools for organizers, venues, and players.
            </p>
          </div>

          {/* Quick Links */}
          <div>
            <h3 className="text-xl font-bold mb-6 text-[#FFFBF4]">Quick Links</h3>
            <ul className="space-y-3">
              {quickLinks.map((link) => (
                <li key={link.label}>
                  <a
                    href={link.href}
                    onClick={(e) => scrollToSection(e, link.href)}
                    className="text-[#D1D5DB] hover:text-[#FFFBF4] transition-colors duration-300"
                  >
                    {link.label}
                  </a>
                </li>
              ))}
            </ul>
          </div>

          {/* Platform Links */}
          <div>
            <h3 className="text-xl font-bold mb-6 text-[#FFFBF4]">Platform</h3>
            <ul className="space-y-3">
              {platformLinks.map((link) => (
                <li key={link.label}>
                  <a href="#" className="text-[#D1D5DB] hover:text-[#FFFBF4] transition-colors duration-300 flex items-center gap-2">
                    <span className="text-[#FFFBF4]">{link.icon}</span>
                    {link.label}
                  </a>
                </li>
              ))}
            </ul>
          </div>

          {/* Contact Info */}
          <div>
            <h3 className="text-xl font-bold mb-6 text-[#FFFBF4]">Contact Info</h3>
            <ul className="space-y-4">
              <li className="flex items-start space-x-3">
                <FaEnvelope className="h-5 w-5 text-[#FFFBF4] mt-1" />
                <span className="text-[#D1D5DB]">info@cuemetrics.com</span>
              </li>
              <li className="flex items-start space-x-3">
                <FaPhone className="h-5 w-5 text-[#FFFBF4] mt-1" />
                <span className="text-[#D1D5DB]">+1 (555) 123-4567</span>
              </li>
              <li className="flex items-start space-x-3">
                <FaMapMarkerAlt className="h-5 w-5 text-[#FFFBF4] mt-1" />
                <span className="text-[#D1D5DB]">123 Cue Sports Ave<br />Snooker City, SC 12345</span>
              </li>
            </ul>
          </div>
        </div>

        {/* Bottom Bar */}
        <div className="border-t border-[#1A3F5C] pt-8 flex flex-col md:flex-row justify-between items-center">
          <div className="text-[#D1D5DB] text-sm mb-4 md:mb-0">
            © {new Date().getFullYear()} Cuemetrics. All rights reserved. | A Multi-Sport League Management Platform
          </div>
          <div className="flex space-x-6">
            {socialLinks.map((social, index) => (
              <a
                key={index}
                href={social.href}
                className="text-[#D1D5DB] hover:text-[#FFFBF4] text-xl transition-colors duration-300"
              >
                {social.icon}
              </a>
            ))}
          </div>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
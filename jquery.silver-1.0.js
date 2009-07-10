(function($) {
	$.fn.extend({
		silver: function(options) {
			return $.silver(this.selector, options || {})
		}
	});

	$.silver = function(selector, options) {
		options = $.extend({}, $.silver.defaults, {selector: selector || 'body'}, options);

		Commands = $.extend({}, Commands, {}, options.commands);

		var silver = new Silver(options);
		
		$(document)
			.bind('keydown', options.hotkey, function(e) { silver.toggle(); e.preventDefault(); })
			.click(function(e) {
				// clicked outside jquery.silver
				if($(e.target).parents('.jquery_silver').length == 0)
					silver.hide();
				else
					silver.focusInput();
		});

		return silver;
	}	
	$.silver.defaults = {
		hotkey: 'ctrl+shift+space',
		maxResults: 10,
		maxLastItems: 5
	}

	function Silver(options) {
		var visible = false;
		var div = $(template).addClass('jquery_silver');
		var input = div.children('input');
		var ul = div.children('ul');
		
		var menu = new Menu(ul, options);
		var searcher = new Searcher(options);

		$.silver_lastItems = $.cookie ? new LastItems(menu, options) : {add: function(){}}; // no cookies, no lastitems
		
		$('body').append(div);

		var silver = {
			toggle: function() {
				visible ? this.hide() : this.show();
				visible = !visible;
				div.center();
			},
			hide: function() {
				visible = false;
				options.hideFunction ? options.hideFunction(div) : div.hide();
				menu.reset();
			},
			show: function() {
				visible = true;
				$.silver_lastItems.get();

				input.val('');
				options.showFunction ? options.showFunction(div) : div.fadeIn(250);
				this.focusInput();
			},
			focusInput: function() {
				input.focus();
			}
		};
		
		var typed = function(e) {
			var val = input.val();
			var k = e.which;
			var c = String.fromCharCode(k);

			var criteria = val + c;
			if(k == 8) criteria = criteria.substring(0, criteria.length - 2); // backspace
			if(criteria != val) {
				if(criteria == ':') {
					menu.showCommands();
				} else if(criteria.charAt(0) != ':'){
					var links = searcher.search(criteria);
					menu.showLinks(links, criteria);
				}
			}
		}

		input.keydown(function(e){
			if(e.keyCode == 8) typed(e); // safari
		})
		
		input.keypress(function(e) {
			var w = e.charCode || e.which;
			var num = parseInt(String.fromCharCode(w));
			if(isNaN(num) == false) { // accessing by numbers
				if(!menu.open(num)) {
					silver.hide();
				}
				//e.preventDefault();
			}
			else if(w >= 65 && w <= 256 || w == 8){
				typed(e);
				prevent = false;
			}
		});

		input.bind('keydown', 'down', menu.next);
		input.bind('keydown', 'up', menu.previous);
		input.bind('keydown', 'esc', silver.hide);

		input.keydown(function(e) { // using hotkeys to 'return' simply doesn't work
			if(e.keyCode != 13) return;
			var val = input.val();
			if(val.charAt(0) == ':') { // command
				Commands.doCommand(val);
				input.val('');
				menu.reset();
			} else {
				if(!menu.open()) {
					silver.hide();
				}
			}
		});

		return silver;
	}
	
	function Menu(ul, resetCallback) {
		var currentIndex = -1;
		var currentSelected;
		var links = [];
		function navigate() {
			if(links.length == 0) return;

			if(currentIndex >= links.length) currentIndex = 0;
			else if(currentIndex < 0)        currentIndex = links.length - 1;

			var selected = links[currentIndex];
			selected.addClass('selected');

			if(currentSelected) currentSelected.removeClass('selected');
			currentSelected = selected;
		}

		function underLineCriteria(text, criteria) {
			criteria = $.trim(criteria.toLowerCase()).split('');
			var lowerText = text.toLowerCase();
			var lastIndex = 0;
			for(var i in criteria) {
				var index = lowerText.indexOf(criteria[i], lastIndex);
				if(index < 0) break;
				text = text.substring(0, index) + '<u>' + text.substring(index, index + 1) + '</u>' + text.substring(index + 1);
				lowerText = text.toLowerCase();
				lastIndex = index + 7; //7: <u></u> length
			}
			
			return text;
		}
		
		return {
			next: function() {
				++currentIndex;
				navigate();
			},
			previous: function() {
				--currentIndex;
				navigate();
			},
			open: function(num) {
				if(num >= 0) {
					currentIndex = num;
					navigate();
				} else if(!num || (currentIndex == -1 && links.length > 0)) { // when pressing enter
					currentIndex = 0;
					navigate();
				}

				if(currentSelected) {
					var urlOrFunc = currentSelected.url;
					if(urlOrFunc.indexOf('http://') == 0 || urlOrFunc.indexOf('file://') == 0) {
						$.silver_lastItems.add(currentSelected.attr('originaltext'), currentSelected.url.replace(/\n/g, '')); // don't store buttons on last actions
						window.location = urlOrFunc;
					} else {
						eval('function a(){'+urlOrFunc+'}'); // it's an button, call it's function
						a.call(currentSelected.originalEl);
						
						return false;
					}
				}
				return currentSelected;
			},
			addCommand: function(name, description, func) {
				var li = $('<li>').html(name + ': ' + description);
				ul.append(li);
			},
			showLinks: function(newLinks, criteria) {
				this.reset();
				if(!newLinks || newLinks.length == 0) return;

				var li, link, text;
				for(var i in newLinks) {
					link   = newLinks[i];
					text   = i + '. ' + (criteria ? underLineCriteria(link.originalText, criteria) : link.originalText);
					li     = $('<li>').html(text);
					li.url = link.href || link.getAttribute('onclick');
					li.attr('originaltext', link.originalText);

					if(link.tagName == 'INPUT')
						li.originalEl = link;
					
					ul.append(li);
					links.push(li);
				}
			},
			reset: function() {
				links        = [];
				currentIndex = -1;
				ul.children().remove();
			},
			showCommands: function() {
				this.reset();
				var c;
				for(i in Commands) {
					c = Commands[i];
					if(c.description) {
						this.addCommand(i, c.description, c.func);
					}
				}
			}
		}
	}
	
	function Searcher(options) {
		var links = $(options.selector + ' a')
						.add(options.selector + ' input[type="button"]')
						.add(options.selector + ' input[type="submit"]');

		function doRank(text, criteria) {
			if(criteria.toLowerCase() == criteria) // lower mode
				text = text.toLowerCase();

			text = text.replace(/\s+/g, '');
			criteria = criteria.replace(/\s+/g, '').split('');

			var len = text.length;
			if(len < criteria.length) return 0;

			var value = 0;
			var lastIndex = -1;
			var index = 0;
			for(var i in criteria) {
				index = text.indexOf(criteria[i], lastIndex + 1);
				if(index < 0) return 0;
				value += (len - index);
				lastIndex = index;
			}

			return value;
		}

		var searcher = {
			search: function(criteria) {
				var ranked = [];
				links.each(function(c, e){
					var rank = doRank(e.value || e.innerHTML, criteria);
					if(rank > 0)
						ranked.push({link: e, rank: rank});
				});
				ranked.sort(function(a, b) {
					return b.rank - a.rank;
				});
				
				var rankedLinks = [];
				var link;
				for(var i in ranked) {
					if(i == options.maxResults) break;
					
					link = ranked[i].link;
					link.originalText = link.value || link.innerHTML;
					rankedLinks.push(link);
				}
				return rankedLinks;
			}
		};
		
		return searcher;
	}
	
	function LastItems(menu, options) {
		var cookie = 'jquery_silver_lastItems';

		function load() {
			eval('var items = [' + ($.cookie(cookie) || '') + ']');
			return items;
		}
		function format(text, url) {
			return '{originalText:"' + text + '",href:"' + url + '"}';
		}
		return {
			add: function(text, url) {
				var items = load();
				var newItems = [];
				newItems.push(format(text, url));
				var count = 0;
				for(var i in items) {
					if(count >= options.maxLastItems - 1) break;

					if(items[i].originalText != text) { // duplication
						newItems.push(format(items[i].originalText, items[i].href));
						count++;
					}
				}
				$.cookie(cookie, newItems.join(','), {path: '/', expires: 10});
			},
			get: function() {
				menu.showLinks(load());
			}
		};
	}
	
	Commands = {
		doCommand: function(val) {
			val     = val.substring(1).split(' ');
			command = val[0];
			args    = val[1];
			this[command].func(args);
		}
	}

	var template = 
	'<div>' +
	'	<input/>' +
	'	<ul>' +
	'	</ul>' +
	'</div>' +
	'';

	function log() {
		if(console && console.log) console.log.apply(console, arguments);
	}
})(jQuery);

$.fn.center = function(options) {
	return this.each(function(index) {
		var height = document.documentElement ? document.documentElement.clientHeight + document.documentElement.scrollTop : window.innerHeight;
		var width = document.documentElement ? document.documentElement.clientWidth + document.documentElement.scrollLeft : window.innerWidth;
		if (index == 0) {
			$(this).css({
				top: (height / 2) - ($(this).height() / 2) - 100,
				left: (width / 2) - ($(this).width() / 2)
			});
		}
	});
};
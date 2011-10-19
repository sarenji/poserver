require 'yaml'
require 'builder'

def cherry_pick(hash, data, attribute_name, opts={}, &block)
  attribute = data.delete(attribute_name.to_s) || opts[:default]
  raise "'#{attribute_name}' attribute not provided in #{data}." if opts[:required] and attribute.nil?
  attribute = block.call(attribute) if block_given?
  hash.store(attribute_name, attribute) if attribute
end

def parse_category(xml, category_name, data)
  # create tiers
  data.each do |tier_name, tier_data|
    attributes = parse_tier_attributes tier_name, tier_data
    xml.tier attributes 
  end
  xml
end

def parse_tier_attributes(tier_name, data)
  hash = {:name => tier_name}
  cherry_pick hash, data, :displayOrder, :required => true
  cherry_pick hash, data, :gen, :default => 0
  cherry_pick hash, data, :maxLevel, :default => 100
  cherry_pick hash, data, :banMode, :default => "ban"
  cherry_pick hash, data, :mode, :default => 0
  cherry_pick hash, data, :banParent, :default => ""
  cherry_pick hash, data, :numberOfPokemons, :default => 6
  cherry_pick hash, data, :numberOfRestricted, :default => 1
  cherry_pick hash, data, :tableName, :default => "tier_#{tier_name.downcase.gsub(/\s+/, "")}"
  cherry_pick(hash, data, :clauses) {|clauses| clauses ||= []; clauses.join ", "}
  cherry_pick(hash, data, :moves) {|moves| moves ||= []; moves.join ", "}
  cherry_pick(hash, data, :items) {|items| items ||= []; items.join ", "}
  cherry_pick(hash, data, :pokemons) {|pokemon| pokemon ||= []; pokemon.join ", "}
  cherry_pick(hash, data, :restrictedPokemons) {|pokemon| pokemon ||= []; pokemon.join ", "}
  hash
end

def create_xml
  result  = ""
  builder = Builder::XmlMarkup.new(:indent => 2)

  result = builder.category(:displayOrder => 0) do |category|
    YAML::load(open('tiers.yml')).each do |category_name, data|
      hash = {:name => category_name}
      cherry_pick hash, data, :displayOrder, :required => true
      result = category.category(hash) do |category|
        parse_category category, category_name, data
      end
    end
  end

  result
end

File.open 'tiers.xml', 'w' do |f|
  f.write create_xml
end

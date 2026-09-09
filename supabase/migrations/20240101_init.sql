-- Initial schema for ImmoAndTheBrain
-- Create extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Properties table
CREATE TABLE IF NOT EXISTS properties (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    address VARCHAR(255) NOT NULL,
    property_type VARCHAR(50) NOT NULL,
    tenancy_type VARCHAR(50) NOT NULL,
    purchase_price DECIMAL(15, 2),
    living_space DECIMAL(10, 2),
    year_built INTEGER,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Users table (extends Supabase auth.users)
CREATE TABLE IF NOT EXISTS profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email VARCHAR(255) NOT NULL UNIQUE,
    full_name VARCHAR(255),
    avatar_url TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Property valuations table
CREATE TABLE IF NOT EXISTS property_valuations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    property_id UUID REFERENCES properties(id) ON DELETE CASCADE,
    user_id UUID REFERENCES profiles(id),
    valuation_type VARCHAR(20) NOT NULL, -- 'quick-check' or 'detail-check'
    estimated_value DECIMAL(15, 2),
    data_entry_type VARCHAR(50),
    status VARCHAR(20) DEFAULT 'draft', -- draft, in-progress, completed
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes
CREATE INDEX idx_properties_property_type ON properties(property_type);
CREATE INDEX idx_properties_created_at ON properties(created_at);
CREATE INDEX idx_property_valuations_property_id ON property_valuations(property_id);
CREATE INDEX idx_property_valuations_user_id ON property_valuations(user_id);
CREATE INDEX idx_property_valuations_status ON property_valuations(status);

-- Enable Row Level Security
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE properties ENABLE ROW LEVEL SECURITY;
ALTER TABLE property_valuations ENABLE ROW LEVEL SECURITY;

-- RLS Policies for profiles
CREATE POLICY "Users can view their own profile" 
    ON profiles FOR SELECT 
    USING (auth.uid() = id);

CREATE POLICY "Users can update their own profile" 
    ON profiles FOR UPDATE 
    USING (auth.uid() = id);

-- RLS Policies for properties
CREATE POLICY "Users can view all properties" 
    ON properties FOR SELECT 
    TO authenticated 
    USING (true);

CREATE POLICY "Users can create properties" 
    ON properties FOR INSERT 
    TO authenticated 
    WITH CHECK (true);

CREATE POLICY "Users can update properties" 
    ON properties FOR UPDATE 
    TO authenticated 
    USING (true);

-- RLS Policies for property_valuations
CREATE POLICY "Users can view their own valuations" 
    ON property_valuations FOR SELECT 
    USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own valuations" 
    ON property_valuations FOR INSERT 
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own valuations" 
    ON property_valuations FOR UPDATE 
    USING (auth.uid() = user_id);

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers for updated_at
CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON profiles
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_properties_updated_at BEFORE UPDATE ON properties
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_property_valuations_updated_at BEFORE UPDATE ON property_valuations
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Function to handle new user profile creation
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.profiles (id, email, full_name)
    VALUES (NEW.id, NEW.email, NEW.raw_user_meta_data->>'full_name');
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to create profile on signup
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION handle_new_user();
